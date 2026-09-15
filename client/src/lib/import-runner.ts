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
  /**
   * Set by `failedTasks` when a previous attempt got partway through this
   * series before failing: the record it already created, and how many of
   * `files` (from the front) are already on it. A retry skips `sendCreate`
   * entirely and appends only `files.slice(sentCount)` — otherwise a retry
   * of a multi-chunk series would call `sendCreate` again and leave the
   * first attempt's record orphaned with no further chunks ever appended
   * to it (plan 15 round 2).
   */
  resume?: { documentId: number; sentCount: number };
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

/** Creates the document from a series' first chunk; resolves to its new id and the file count now on it (its first chunk's size, echoed by the server). */
export type SendCreateFn<F = File> = (
  task: ImportSeriesTask<F>,
  files: F[],
) => Promise<{ id: number; fileCount: number }>;

/** Appends one further chunk to an already-created document; resolves to the file count now on the record (the server's own running total, not just this chunk's size). */
export type SendAppendFn<F = File> = (
  documentId: number,
  files: F[],
) => Promise<{ fileCount: number }>;

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
  let sent = task.resume?.sentCount ?? 0;
  let documentId: number | undefined = task.resume?.documentId;

  const report = (status: SeriesStatus, extra: Partial<SeriesProgress> = {}): SeriesProgress => {
    const progress: SeriesProgress = { key: task.key, sent, total, status, documentId, ...extra };
    options.onProgress?.(progress);
    return progress;
  };

  report("uploading");
  try {
    // The remaining files to send: everything from where a previous attempt
    // left off (0 for a fresh task). `sent`/`documentId` are then trusted to
    // the server's own echoed fileCount, not local arithmetic — a retry
    // must reflect what the record actually holds, not what this attempt
    // assumes it sent.
    const chunks = chunkFiles(task.files.slice(sent), chunkSize);

    if (documentId == null) {
      const [first, ...rest] = chunks;
      const created = await options.sendCreate(task, first ?? []);
      documentId = created.id;
      sent = created.fileCount;
      report("uploading");

      for (const chunk of rest) {
        const appended = await options.sendAppend(created.id, chunk);
        sent = appended.fileCount;
        report("uploading");
      }
    } else {
      for (const chunk of chunks) {
        const appended = await options.sendAppend(documentId, chunk);
        sent = appended.fileCount;
        report("uploading");
      }
    }
    return report("done");
  } catch (error) {
    return report("failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

/**
 * The tasks whose last `runImport` result was "failed", in their original
 * order — ready to pass straight back into `runImport` to retry. A task
 * whose failed attempt had already created its record (`result.documentId`
 * set) carries that forward as `resume`, so the retry appends the remaining
 * files to the same record instead of creating a second one; a task that
 * failed on its very first request (no record created yet) retries as a
 * plain create, same as a first attempt.
 */
export function failedTasks<F>(
  tasks: ImportSeriesTask<F>[],
  results: SeriesProgress[],
): ImportSeriesTask<F>[] {
  const failedResultByKey = new Map(
    results.filter((result) => result.status === "failed").map((result) => [result.key, result] as const),
  );
  return tasks
    .filter((task) => failedResultByKey.has(task.key))
    .map((task) => {
      const result = failedResultByKey.get(task.key)!;
      if (result.documentId == null) {
        return task;
      }
      return { ...task, resume: { documentId: result.documentId, sentCount: result.sent } };
    });
}

/** Assumed sustained upload throughput for the upfront estimate, before any bytes have actually moved (plan 15 round 2). */
export const ASSUMED_UPLOAD_BYTES_PER_SECOND = 8 * 1024 * 1024;

export type EtaEstimate = {
  seconds: number;
  /** false for the upfront guess (total bytes at the assumed rate); true once a real batch has been measured. */
  measured: boolean;
};

/**
 * Estimated time remaining. With no `measured` sample this is a flat guess
 * from `remainingBytes` at `ASSUMED_UPLOAD_BYTES_PER_SECOND` — good enough
 * to show before an import has sent a single byte. Once at least one batch
 * has actually gone over the wire, pass its observed rate as `measured` to
 * refine the estimate to this connection's real throughput.
 */
export function estimateEtaSeconds(
  remainingBytes: number,
  measured?: { bytesSent: number; elapsedSeconds: number },
): EtaEstimate {
  if (measured && measured.elapsedSeconds > 0 && measured.bytesSent > 0) {
    const rate = measured.bytesSent / measured.elapsedSeconds;
    return { seconds: remainingBytes / rate, measured: true };
  }
  return { seconds: remainingBytes / ASSUMED_UPLOAD_BYTES_PER_SECOND, measured: false };
}
