import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import Navigation from "@/components/navigation";
import TypeBadge from "@/components/type-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { FolderOpen, Layers, ScanLine } from "lucide-react";
import { postFiles } from "@/components/upload-dialog";
import {
  IMPORT_HEAD_BYTES,
  planImport,
  type ImportPlan,
  type ImportSourceFile,
  type PlannedSeries,
} from "@shared/import-plan";
import {
  failedTasks,
  runImport,
  type ImportSeriesTask,
  type SeriesProgress,
} from "@/lib/import-runner";
import type { MedicalDocument } from "@shared/schema";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatEta(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return minutes === 1 ? "about 1 minute" : `about ${minutes} minutes`;
}

/** Every source file's own display path, unique even for two files sharing a bare name (drag/drop and e2e fixtures don't always carry webkitRelativePath). */
function filePath(file: File, index: number): string {
  const relative = (file as unknown as { webkitRelativePath?: string }).webkitRelativePath;
  return relative || `${index}:${file.name}`;
}

async function buildSourceFiles(
  files: File[],
): Promise<{ sources: ImportSourceFile[]; byPath: Map<string, File> }> {
  const byPath = new Map<string, File>();
  const sources: ImportSourceFile[] = new Array(files.length);
  await Promise.all(
    files.map(async (file, index) => {
      const path = filePath(file, index);
      byPath.set(path, file);
      const head = new Uint8Array(await file.slice(0, IMPORT_HEAD_BYTES).arrayBuffer());
      sources[index] = { path, size: file.size, head };
    }),
  );
  return { sources, byPath };
}

function defaultSelection(plan: ImportPlan): Set<string> {
  const selected = new Set<string>();
  for (const study of plan.studies) {
    for (const series of study.series) {
      if (series.selectedByDefault) {
        selected.add(series.seriesInstanceUid);
      }
    }
  }
  return selected;
}

function tasksFromPlan(
  plan: ImportPlan,
  selected: Set<string>,
  byPath: Map<string, File>,
): ImportSeriesTask[] {
  const tasks: ImportSeriesTask[] = [];
  for (const study of plan.studies) {
    for (const series of study.series) {
      if (!selected.has(series.seriesInstanceUid)) {
        continue;
      }
      tasks.push({
        key: series.seriesInstanceUid,
        title: series.label,
        documentType: series.documentType,
        documentDate: series.documentDate,
        files: series.files.map((planned) => byPath.get(planned.path)!),
      });
    }
  }
  return tasks;
}

function totalSelectedBytes(plan: ImportPlan, selected: Set<string>): number {
  return plan.studies
    .flatMap((study) => study.series)
    .filter((series) => selected.has(series.seriesInstanceUid))
    .reduce((sum, series) => sum + series.totalBytes, 0);
}

async function sendCreate(task: ImportSeriesTask, files: File[]): Promise<{ id: number }> {
  const fields = new FormData();
  fields.append("title", task.title);
  fields.append("documentType", task.documentType);
  fields.append("documentDate", task.documentDate);
  fields.append("tags", JSON.stringify([]));
  const response = await postFiles("/api/documents", fields, files);
  return (await response.json()) as MedicalDocument;
}

async function sendAppend(documentId: number, files: File[]): Promise<void> {
  await postFiles(`/api/documents/${documentId}/files`, new FormData(), files);
}

function SeriesRow({
  series,
  selected,
  onToggle,
}: {
  series: PlannedSeries;
  selected: boolean;
  onToggle: () => void;
}) {
  const nothingToShow =
    series.viewability.kind === "empty-report" || series.viewability.kind === "opaque"
      ? series.viewability
      : null;
  return (
    <label
      className="flex items-start gap-3 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-surface-1 transition-colors cursor-pointer"
      data-testid={`import-series-row-${series.seriesInstanceUid}`}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={onToggle}
        data-testid={`checkbox-import-series-${series.seriesInstanceUid}`}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <TypeBadge document={{ documentType: series.documentType, dicomMeta: series.meta }} />
          <p className="font-medium text-foreground font-body truncate">{series.label}</p>
        </div>
        <p className="text-sm text-foreground-muted font-body">
          {series.fileCount === 1 ? "1 file" : `${series.fileCount} files`} ·{" "}
          {formatBytes(series.totalBytes)}
          {nothingToShow ? ` · nothing to display — ${nothingToShow.reason}` : ""}
        </p>
      </div>
    </label>
  );
}

function StudySection({
  study,
  selected,
  onToggleSeries,
}: {
  study: ImportPlan["studies"][number];
  selected: Set<string>;
  onToggleSeries: (seriesInstanceUid: string) => void;
}) {
  return (
    <Card data-testid={`import-study-${study.studyInstanceUid}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground font-display truncate">{study.label}</h3>
            {study.studyDescription && (
              <p className="text-sm text-foreground-muted font-body truncate">
                {study.studyDescription}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {study.modalities.map((modality) => (
              <span key={modality} className="badge-sage">
                {modality}
              </span>
            ))}
          </div>
        </div>
        <p className="text-sm text-foreground-muted font-body flex items-center">
          <Layers className="mr-2 h-4 w-4 text-primary" />
          {study.seriesCount === 1 ? "1 series" : `${study.seriesCount} series`} ·{" "}
          {study.fileCount === 1 ? "1 file" : `${study.fileCount} files`} ·{" "}
          {formatBytes(study.totalBytes)}
        </p>
        <div className="space-y-2">
          {study.series.map((series) => (
            <SeriesRow
              key={series.seriesInstanceUid}
              series={series}
              selected={selected.has(series.seriesInstanceUid)}
              onToggle={() => onToggleSeries(series.seriesInstanceUid)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Import() {
  const { isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setTimeout(() => setLocation("/login"), 500);
    }
  }, [isAuthenticated, isLoading, setLocation]);

  const [building, setBuilding] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<Record<string, SeriesProgress>>({});
  const [etaLabel, setEtaLabel] = useState<string | null>(null);

  const byPathRef = useRef<Map<string, File>>(new Map());
  const allTasksRef = useRef<ImportSeriesTask[]>([]);
  const lastRunResultsRef = useRef<SeriesProgress[]>([]);
  const bytesSentRef = useRef(0);
  const uploadStartRef = useRef<number | null>(null);
  const lastSentByKeyRef = useRef<Record<string, number>>({});
  const selectedBytesRef = useRef(0);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }
    setBuilding(true);
    try {
      const { sources, byPath } = await buildSourceFiles(files);
      byPathRef.current = byPath;
      const today = new Date().toISOString().slice(0, 10);
      const nextPlan = planImport(sources, { today });
      setPlan(nextPlan);
      setSelected(defaultSelection(nextPlan));
      setResults({});
    } catch (error) {
      toast({
        title: "Couldn't read that folder",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBuilding(false);
    }
  };

  const chooseFolder = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files ?? []);
      handleFiles(files);
    };
    input.click();
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

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    handleFiles(files);
  };

  const toggleSeries = (seriesInstanceUid: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seriesInstanceUid)) {
        next.delete(seriesInstanceUid);
      } else {
        next.add(seriesInstanceUid);
      }
      return next;
    });
  };

  const updateEta = (task: ImportSeriesTask, progress: SeriesProgress) => {
    if (uploadStartRef.current == null) {
      uploadStartRef.current = Date.now();
    }
    const prevSent = lastSentByKeyRef.current[progress.key] ?? 0;
    if (progress.sent > prevSent) {
      const newlySent = task.files.slice(prevSent, progress.sent);
      bytesSentRef.current += newlySent.reduce((sum, f) => sum + f.size, 0);
      lastSentByKeyRef.current[progress.key] = progress.sent;
    }
    const elapsedSeconds = (Date.now() - uploadStartRef.current) / 1000;
    if (elapsedSeconds >= 1 && bytesSentRef.current > 0) {
      const rate = bytesSentRef.current / elapsedSeconds;
      const remaining = Math.max(0, selectedBytesRef.current - bytesSentRef.current);
      setEtaLabel(formatEta(remaining / rate));
    }
  };

  const runTasks = async (tasksToRun: ImportSeriesTask[]) => {
    if (tasksToRun.length === 0) {
      return;
    }
    setImporting(true);
    const tasksByKey = new Map(tasksToRun.map((t) => [t.key, t] as const));
    const runResults = await runImport(tasksToRun, {
      sendCreate,
      sendAppend,
      onProgress: (progress) => {
        setResults((prev) => ({ ...prev, [progress.key]: progress }));
        const task = tasksByKey.get(progress.key);
        if (task) {
          updateEta(task, progress);
        }
      },
    });
    lastRunResultsRef.current = runResults;
    setImporting(false);

    const stillFailed = runResults.filter((r) => r.status === "failed");
    if (stillFailed.length === 0) {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["studies"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      const studyCount = plan?.studies.length ?? 0;
      toast({
        title: "Import complete",
        description:
          studyCount === 1 ? "1 study imported" : `${studyCount} studies imported`,
      });
      setLocation("/documents");
    } else {
      toast({
        title: "Some series failed to upload",
        description: `${stillFailed.length} of ${tasksToRun.length} series failed. They can be retried below.`,
        variant: "destructive",
      });
    }
  };

  const startImport = () => {
    if (!plan) {
      return;
    }
    const tasks = tasksFromPlan(plan, selected, byPathRef.current);
    allTasksRef.current = tasks;
    selectedBytesRef.current = totalSelectedBytes(plan, selected);
    bytesSentRef.current = 0;
    uploadStartRef.current = null;
    lastSentByKeyRef.current = {};
    setEtaLabel(null);
    setResults({});
    runTasks(tasks);
  };

  const retryFailed = () => {
    const retryable = failedTasks(allTasksRef.current, lastRunResultsRef.current);
    runTasks(retryable);
  };

  if (isLoading || !isAuthenticated) {
    return null;
  }

  const totals = plan?.totals;
  const failedResults = Object.values(results).filter((r) => r.status === "failed");
  const selectedCount = selected.size;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <div className="max-w-4xl mx-auto px-6 lg:px-8 py-10 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display mb-2">
            Import a disc
          </h1>
          <p className="text-sm text-foreground-muted font-body max-w-2xl">
            Point at the folder from a hospital CD and get one card per study. Index files
            (<code className="font-mono">DICOMDIR</code>, the bundled viewer, autorun) are
            skipped automatically — only the <code className="font-mono">ST…/SE…</code> image
            folders matter. Structured reports, ultrasound cine loops, and angiography runs
            upload fine but do not draw in the viewer yet.
          </p>
        </div>

        {!plan && (
          <div
            className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors duration-200 ${
              dragActive
                ? "border-medical-blue bg-medical-blue bg-opacity-5"
                : "border-gray-300 hover:border-medical-blue"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            data-testid="import-dropzone"
          >
            <FolderOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-600 mb-2">
              {building ? "Reading folder…" : "Drop the disc's folder here, or choose it"}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={chooseFolder}
              disabled={building}
              data-testid="button-choose-import-folder"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Choose folder
            </Button>
          </div>
        )}

        {plan && totals && (
          <div className="space-y-4" data-testid="import-preview">
            <Card>
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <p className="text-sm text-foreground font-body" data-testid="import-totals">
                  {totals.studies === 1 ? "1 study" : `${totals.studies} studies`} ·{" "}
                  {totals.series === 1 ? "1 series" : `${totals.series} series`} ·{" "}
                  {totals.files.toLocaleString()} files · {formatBytes(totals.bytes)}
                  {etaLabel ? ` · ${etaLabel}` : ""}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPlan(null);
                      setSelected(new Set());
                      setResults({});
                    }}
                    disabled={importing}
                    data-testid="button-clear-import-selection"
                  >
                    Choose a different folder
                  </Button>
                  <Button
                    type="button"
                    onClick={startImport}
                    disabled={importing || selectedCount === 0}
                    data-testid="button-start-import"
                  >
                    {importing
                      ? "Importing…"
                      : selectedCount === 1
                        ? "Import 1 series"
                        : `Import ${selectedCount} series`}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {plan.studies.length === 0 && (
              <Card>
                <CardContent className="p-6 text-center text-foreground-muted font-body">
                  <ScanLine className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  No DICOM series found in that folder.
                </CardContent>
              </Card>
            )}

            {plan.studies.map((study) => (
              <StudySection
                key={study.studyInstanceUid}
                study={study}
                selected={selected}
                onToggleSeries={toggleSeries}
              />
            ))}

            {Object.keys(results).length > 0 && (
              <Card data-testid="import-progress">
                <CardContent className="p-4 space-y-3">
                  <h3 className="font-semibold text-foreground font-display">Progress</h3>
                  {Object.values(results).map((progress) => (
                    <div key={progress.key} data-testid={`import-progress-${progress.key}`}>
                      <div className="flex items-center justify-between text-sm font-body mb-1">
                        <span className="truncate">
                          {allTasksRef.current.find((t) => t.key === progress.key)?.title ??
                            progress.key}
                        </span>
                        <span className="text-foreground-muted">
                          {progress.status === "failed"
                            ? `Failed — ${progress.error ?? "unknown error"}`
                            : `${progress.sent} / ${progress.total}`}
                        </span>
                      </div>
                      <Progress
                        value={progress.total === 0 ? 0 : (progress.sent / progress.total) * 100}
                      />
                    </div>
                  ))}
                  {failedResults.length > 0 && !importing && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={retryFailed}
                      data-testid="button-retry-failed-import"
                    >
                      Retry {failedResults.length === 1 ? "1 series" : `${failedResults.length} series`}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Recursively expands a folder dropped on the page into its files, using
 * the (non-standard but universally supported) webkitGetAsEntry directory
 * API — a plain drop of loose files falls back to `dataTransfer.files`.
 */
async function filesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item) =>
      "webkitGetAsEntry" in item
        ? (item as DataTransferItem & { webkitGetAsEntry(): FileSystemEntry | null }).webkitGetAsEntry()
        : null,
    )
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (entries.length === 0) {
    return Array.from(dataTransfer.files ?? []);
  }

  const files: File[] = [];
  for (const entry of entries) {
    await walkEntry(entry, files);
  }
  return files;
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push(file);
    return;
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const children = await readAllEntries(reader);
    for (const child of children) {
      await walkEntry(child, out);
    }
  }
}

/** FileSystemDirectoryReader.readEntries returns at most a browser-chosen batch at a time; keep calling until it's empty. */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
        } else {
          all.push(...batch);
          readBatch();
        }
      }, reject);
    };
    readBatch();
  });
}
