import { chunkFiles, MAX_FILES_PER_REQUEST } from "@shared/upload-kinds";

/**
 * One series queued for upload: everything `runImport` needs to send it
 * through the existing chunked document path (POST /api/documents, then
 * POST /api/documents/:id/files — plan 02/07), independent of any React
 * state. Generic over the file type so this stays a pure Node-testable
 * module with no DOM File dependency; the real page passes `File[]`.
 */
export type ImportSeriesTask<F = File> = {
  /** Stable identity for this series across runs — its seriesInstanceUid. */
  key: string;
  title: string;
  documentType: string;
  documentDate: string;
  /** Ordered for upload — see shared/import-plan.ts's PlannedSeries.files. */
  files: F[];
};

export type SeriesStatus = "uploading" | "done" | "failed";

export type SeriesProgress = {
  key: string;
  /** Files sent so far — a whole chunk lands at once, never a partial one. */
  sent: number;
  total: number;
  status: SeriesStatus;
  error?: string;
  documentId?: number;
};

/** Creates the document from a series' first chunk; resolves to its new id. */
export type SendCreateFn<F = File> = (
  task: ImportSeriesTask<F>,
  files: F[],
) => Promise<{ id: number }>;

/** Appends one further chunk to an already-created document. */
export type SendAppendFn<F = File> = (documentId: number, files: F[]) => Promise<void>;

export type RunImportOptions<F = File> = {
  sendCreate: SendCreateFn<F>;
  sendAppend: SendAppendFn<F>;
  onProgress?: (progress: SeriesProgress) => void;
  /** Slices per upload request; defaults to the server's own cap. Overridable for tests. */
  chunkSize?: number;
};

/**
 * Uploads every task's series in order, one at a time (so a large disc
 * never opens dozens of parallel multi-hundred-MB requests). A series that
 * throws is recorded as "failed" and the import moves on to the next one —
 * one bad series never blocks the rest of a disc. Failed series can be
 * retried later by re-running `failedTasks(tasks, results)`.
 */
export async function runImport<F = File>(
  tasks: ImportSeriesTask<F>[],
  options: RunImportOptions<F>,
): Promise<SeriesProgress[]> {
  const results: SeriesProgress[] = [];
  for (const task of tasks) {
    results.push(await uploadOneSeries(task, options));
  }
  return results;
}

async function uploadOneSeries<F>(
  task: ImportSeriesTask<F>,
  options: RunImportOptions<F>,
): Promise<SeriesProgress> {
  const total = task.files.length;
  const chunkSize = options.chunkSize ?? MAX_FILES_PER_REQUEST;
  let sent = 0;
  let documentId: number | undefined;

  const report = (status: SeriesStatus, extra: Partial<SeriesProgress> = {}): SeriesProgress => {
    const progress: SeriesProgress = { key: task.key, sent, total, status, documentId, ...extra };
    options.onProgress?.(progress);
    return progress;
  };

  report("uploading");
  try {
    const [first, ...rest] = chunkFiles(task.files, chunkSize);
    const created = await options.sendCreate(task, first ?? []);
    documentId = created.id;
    sent = first?.length ?? 0;
    report("uploading");

    for (const chunk of rest) {
      await options.sendAppend(created.id, chunk);
      sent += chunk.length;
      report("uploading");
    }
    return report("done");
  } catch (error) {
    return report("failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** The tasks whose last `runImport` result was "failed", in their original order — ready to pass straight back into `runImport` to retry. */
export function failedTasks<F>(
  tasks: ImportSeriesTask<F>[],
  results: SeriesProgress[],
): ImportSeriesTask<F>[] {
  const failedKeys = new Set(
    results.filter((result) => result.status === "failed").map((result) => result.key),
  );
  return tasks.filter((task) => failedKeys.has(task.key));
}
