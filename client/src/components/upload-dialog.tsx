import { useState } from "react";
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
import { Upload, FileText, X } from "lucide-react";
import {
  acceptAttribute,
  classifyUpload,
  fitsUploadCap,
  isDicomDocument,
  MAX_UPLOAD_BYTES,
  PART10_SNIFF_BYTES,
  newSeriesTag,
  newSliceTag,
} from "@shared/upload-kinds";

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

  const uploadMutation = useMutation({
    mutationFn: async (data: UploadFormData & { files: File[] }) => {
      const heads = await Promise.all(
        data.files.map(async (file) =>
          new Uint8Array(await file.slice(0, PART10_SNIFF_BYTES).arrayBuffer()),
        ),
      );
      const dicomCount = data.files.filter((file, index) =>
        isDicomDocument({
          mimeType: file.type,
          fileName: file.name,
          bytes: heads[index],
        }),
      ).length;
      const seriesTag =
        dicomCount > 1 ? newSeriesTag() : null;

      for (let index = 0; index < data.files.length; index += 1) {
        const file = data.files[index];
        const tags = [...data.tags];
        if (
          seriesTag &&
          isDicomDocument({
            mimeType: file.type,
            fileName: file.name,
            bytes: heads[index],
          })
        ) {
          tags.push(seriesTag, newSliceTag(index));
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("title", data.title);
        if (data.description) {
          formData.append("description", data.description);
        }
        formData.append("documentType", data.documentType);
        formData.append("documentDate", data.documentDate);
        if (data.doctorName) {
          formData.append("doctorName", data.doctorName);
        }
        if (data.facilityName) {
          formData.append("facilityName", data.facilityName);
        }
        formData.append("tags", JSON.stringify(tags));

        const response = await fetch("/api/documents", {
          method: "POST",
          body: formData,
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`${response.status}: ${errorText}`);
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });

      analytics.documentUploaded(
        variables.documentType,
        variables.files.reduce((sum, file) => sum + file.size, 0),
      );

      toast({
        title: "Success",
        description:
          variables.files.length === 1
            ? "Document uploaded successfully"
            : `${variables.files.length} files uploaded successfully`,
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
        description: error.message || "Failed to upload document",
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
      if (
        !classifyUpload({
          mimeType: file.type,
          originalName: file.name,
          bytes,
        })
      ) {
        toast({
          title: "Invalid file type",
          description:
            "Only PDF, image, and DICOM files are allowed. CD slices with no extension are accepted when they are Part-10 DICOM.",
          variant: "destructive",
        });
        return;
      }
      if (!fitsUploadCap(file.size)) {
        toast({
          title: "File too large",
          description: `Maximum file size is ${MAX_UPLOAD_BYTES / (1024 * 1024)}MB`,
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

    if (!form.getValues("title") && accepted[0]) {
      const nameWithoutExtension = accepted[0].name.replace(/\.[^/.]+$/, "");
      form.setValue("title", nameWithoutExtension);
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
              
              {selectedFiles.length > 0 ? (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    {selectedFiles.map((file) => (
                      <div key={file.name} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-medical-blue bg-opacity-10 rounded-lg flex items-center justify-center">
                            <FileText className="text-medical-blue h-5 w-5" />
                          </div>
                          <div>
                            <p className="font-medium text-professional-dark">{file.name}</p>
                            <p className="text-sm text-gray-600">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
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
                    PDF, JPEG, PNG, or DICOM. 50MB per file. Multiple DICOM slices become one scrollable series. CD slices with no extension are accepted.
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
                      <Input placeholder="e.g., Blood Test Results" {...field} />
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
                      <Input type="date" {...field} />
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
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload Document"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
