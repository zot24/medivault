import { useState } from "react";
import { Link } from "wouter";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import analytics from "@/lib/analytics/umami";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileText, Layers, X } from "lucide-react";
import {
  acceptAttribute,
  classifyUpload,
  countLabel,
  fitsUploadCap,
  isDicomDocument,
  MAX_DICOM_UPLOAD_BYTES,
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_BYTES,
  PART10_SNIFF_BYTES,
  chunkFiles,
  describeSeriesUpload,
  isHeavyUpload,
} from "@shared/upload-kinds";
import { seriesKind } from "@shared/series-kind";
import { detectPhasesFor } from "@/lib/phase-detection";
import { isPhaseCandidate } from "@shared/phases";
import { viewabilityFromMeta } from "@shared/viewability";
import type { MedicalDocument } from "@shared/schema";

const uploadSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  documentType: z.enum(["lab_result", "prescription", "x_ray", "consultation", "other"]),
  documentDate: z.string().min(1, "Document date is required"),
  doctorName: z.string().optional(),
  facilityName: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

type UploadFormData = z.infer<typeof uploadSchema>;

interface UploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Exported (and free of component state) so it can be unit tested directly.
export async function postFiles(path: string, fields: FormData, files: File[]) {
  const body = new FormData();
  fields.forEach((value, key) => body.append(key, value));
  for (const file of files) {
    body.append("files", file);
  }
  const response = await fetch(path, {
    method: "POST",
    body,
    credentials: "include",
  });
  if (!response.ok) {
    let message = "Failed to upload document";
    try {
      const body = await response.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // Body wasn't JSON; fall back to the generic message above.
    }
    // Keep the "{status}: {message}" shape used elsewhere (queryClient.ts's
    // throwIfResNotOk) so isUnauthorizedError still recognizes a 401 here.
    throw new Error(`${response.status}: ${message}`);
  }
  return response;
}

// The "{status}: " prefix on thrown Errors (see postFiles above) is there so
// isUnauthorizedError can recognize a 401 — it isn't meant for the user, so
// strip it before showing a message in a toast.
export function withoutStatusPrefix(message: string): string {
  return message.replace(/^\d{3}: /, "");
}

export default function UploadDialog({ open, onOpenChange }: UploadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);

  const form = useForm<UploadFormData>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      title: "",
      description: "",
      documentType: "lab_result",
      documentDate: "",
      doctorName: "",
      facilityName: "",
      tags: [],
    },
  });

  const [progress, setProgress] = useState<{ sent: number; total: number } | null>(null);
  const seriesSummary = describeSeriesUpload(selectedFiles);

  // One selection is one record. A DICOM series goes up in request-sized
  // chunks: the first creates the record, the rest append to it.
  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormData & { files: File[] }) => {
      const fields = new FormData();
      fields.append("title", data.title);
      if (data.description) {
        fields.append("description", data.description);
      }
      fields.append("documentType", data.documentType);
      fields.append("documentDate", data.documentDate);
      if (data.doctorName) {
        fields.append("doctorName", data.doctorName);
      }
      if (data.facilityName) {
        fields.append("facilityName", data.facilityName);
      }
      fields.append("tags", JSON.stringify(data.tags));

      const [first, ...rest] = chunkFiles(data.files, MAX_FILES_PER_REQUEST);
      setProgress({ sent: 0, total: data.files.length });
      const created = (await (
        await postFiles("/api/documents", fields, first)
      ).json()) as MedicalDocument;
      setProgress({ sent: first.length, total: data.files.length });

      let sent = first.length;
      for (const chunk of rest) {
        await postFiles(`/api/documents/${created.id}/files`, new FormData(), chunk);
        sent += chunk.length;
        setProgress({ sent, total: data.files.length });
      }
      return created;
    },
    onSettled: () => setProgress(null),
    onSuccess: async (created, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });

      analytics.documentUploaded(
        variables.documentType,
        variables.files.reduce((sum, file) => sum + file.size, 0),
      );

      // Plan 13: a CT/MR upload that detectPhases (shared/phases.ts) finds
      // a cardiac cycle in reads "10 phases × 580 slices", not "5800
      // slices" — one extra GET .../files, only for that candidate, so an
      // ordinary upload's toast fires with no added latency.
      const phaseCandidate =
        created.dicomMeta && isPhaseCandidate(created.dicomMeta, variables.files.length);
      const phase = phaseCandidate ? await detectPhasesFor(created.id) : null;

      const viewability = viewabilityFromMeta(created.dicomMeta, created.mimeType);
      const description =
        viewability.kind === "images" || viewability.kind === "report"
          ? variables.files.length === 1
            ? "Document uploaded successfully"
            : // Plan 13: word the toast for what the uploaded files actually are
              // ("56 views", "3 runs", "10 phases × 580 slices") instead of
              // always "slices".
              `Series of ${countLabel(
                created.dicomMeta
                  ? seriesKind(created.dicomMeta, variables.files.length, phase?.hasPhases ?? false)
                  : "single",
                variables.files.length,
                phase?.hasPhases ? phase.sliceCount : null,
              )} uploaded successfully`
          : "Uploaded. This file has no viewable content on this disc; it is kept for completeness.";

      toast({
        title: "Success",
        description,
      });
      handleClose();
    },
    onError: (error, variables) => {
      analytics.documentUploadFailed(
        variables.documentType,
        error.message || "Unknown error"
      );

      if (isUnauthorizedError(error)) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: withoutStatusPrefix(error.message) || "Failed to upload document",
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setSelectedFiles([]);
    form.reset();
    onOpenChange(false);
  };

  const handleFilesSelect = async (incoming: File[]) => {
    const accepted: File[] = [];
    const heads: Uint8Array[] = [];
    for (const file of incoming) {
      const bytes = new Uint8Array(await file.slice(0, PART10_SNIFF_BYTES).arrayBuffer());
      const classified = classifyUpload({
        mimeType: file.type,
        originalName: file.name,
        bytes,
      });
      if (!classified) {
        toast({
          title: "Invalid file type",
          description:
            "Only PDF, image, and DICOM files are allowed. CD slices with no extension are accepted when they are Part-10 DICOM.",
          variant: "destructive",
        });
        return;
      }
      if (!fitsUploadCap(file.size, classified.mimeType)) {
        toast({
          title: "File too large",
          description:
            classified.mimeType === "application/dicom"
              ? `Maximum file size is ${MAX_DICOM_UPLOAD_BYTES / (1024 * 1024)}MB`
              : `Maximum file size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
          variant: "destructive",
        });
        return;
      }
      accepted.push(file);
      heads.push(bytes);
    }

    const dicomCount = accepted.filter((file, index) =>
      isDicomDocument({
        mimeType: file.type,
        fileName: file.name,
        bytes: heads[index],
      }),
    ).length;
    if (accepted.length > 1 && dicomCount !== accepted.length) {
      toast({
        title: "Mixed files",
        description: "A multi-file upload must be all DICOM slices or a single document.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFiles(accepted);

    if (dicomCount > 0) {
      form.setValue("documentType", "x_ray");
    }
    if (!form.getValues("title") && accepted[0]) {
      form.setValue(
        "title",
        accepted.length > 1
          ? `DICOM series (${accepted.length} slices)`
          : accepted[0].name.replace(/\.[^/.]+$/, ""),
      );
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFilesSelect(Array.from(e.dataTransfer.files));
    }
  };

  const onSubmit = (data: UploadFormData) => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate({ ...data, files: selectedFiles });
  };

  const documentTypeOptions = [
    { value: "lab_result", label: "Lab Result" },
    { value: "prescription", label: "Prescription" },
    { value: "x_ray", label: "X-Ray" },
    { value: "consultation", label: "Consultation" },
    { value: "other", label: "Other" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-professional-dark">
            Upload Medical Document
          </DialogTitle>
          <DialogDescription>
            Upload and organize your medical records. Only your account can open the files you add.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* File Upload */}
            <div className="space-y-4">
              <label className="text-sm font-medium text-professional-dark">
                Document File
              </label>
              
              {selectedFiles.length > 1 ? (
                <Card data-testid="upload-series-summary">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-medical-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                        <Layers className="text-medical-blue h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-professional-dark">
                          DICOM series · {seriesSummary.slices} slices · {seriesSummary.sizeLabel}
                        </p>
                        <p className="text-sm text-gray-600">
                          {selectedFiles[0].name} … {selectedFiles[selectedFiles.length - 1].name}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600">
                      Stored as one document. Uploaded in {seriesSummary.requests} batches of up to{" "}
                      {MAX_FILES_PER_REQUEST} slices, in the order shown.
                    </p>
                    {isHeavyUpload(seriesSummary) && (
                      <p
                        className="text-sm rounded-md border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2"
                        data-testid="upload-heavy-notice"
                      >
                        This is a large upload ({seriesSummary.sizeLabel}). It can take several
                        minutes on a slow connection. Keep this dialog open until it finishes;
                        closing it or losing the connection leaves a partial series, which you
                        can delete and upload again.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                      data-testid="button-clear-upload-files"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear files
                    </Button>
                  </CardContent>
                </Card>
              ) : selectedFiles.length === 1 ? (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-medical-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                        <FileText className="text-medical-blue h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-medium text-professional-dark">{selectedFiles[0].name}</p>
                        <p className="text-sm text-gray-600">
                          {(selectedFiles[0].size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFiles([])}
                      data-testid="button-clear-upload-files"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear files
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors duration-200 ${
                    dragActive
                      ? "border-medical-blue bg-medical-blue bg-opacity-5"
                      : "border-gray-300 hover:border-medical-blue"
                  }`}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-lg font-medium text-gray-600 mb-2">
                    Drop your files here, or click to browse
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    PDF, JPEG, PNG, or a single DICOM file. 50MB per file.
                  </p>
                  <p className="text-sm text-gray-600 mb-4">
                    Have a hospital disc?{" "}
                    <Link href="/import" className="text-medical-blue underline">
                      Import the whole folder
                    </Link>{" "}
                    →
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="button-choose-upload-files"
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = acceptAttribute();
                      input.multiple = true;
                      input.onchange = (e) => {
                        const files = Array.from(
                          (e.target as HTMLInputElement).files ?? [],
                        );
                        if (files.length > 0) handleFilesSelect(files);
                      };
                      input.click();
                    }}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Choose File
                  </Button>
                </div>
              )}
            </div>

            {/* Document Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Title</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Blood Test Results"
                        data-testid="input-upload-title"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="documentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {documentTypeOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes about this document..."
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="documentDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Date</FormLabel>
                    <FormControl>
                      <Input type="date" data-testid="input-upload-date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="doctorName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Doctor Name (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Dr. Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="facilityName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Facility Name (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="General Hospital" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Form Actions */}
            <div className="flex justify-end space-x-4 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={uploadMutation.isPending || selectedFiles.length === 0}
                className="bg-medical-blue text-white hover:bg-blue-700"
                data-testid="button-upload-submit"
              >
                {uploadMutation.isPending
                  ? progress && progress.total > 1
                    ? `Uploading ${progress.sent} / ${progress.total}…`
                    : "Uploading..."
                  : "Upload Document"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
