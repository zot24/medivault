import { IMPORT_HEAD_BYTES, type ImportSourceFile, type SkippedFile } from "@shared/import-plan";

/**
 * Everything `buildSourceFiles` needs from a file — the real DOM `File`
 * satisfies this structurally (via `Blob`). Generic so this stays a pure
 * Node-testable module with no DOM dependency.
 */
export type ReadableFile = {
  size: number;
  slice(start: number, end: number): { arrayBuffer(): Promise<ArrayBuffer> };
};

export type SourceFilesResult<F> = {
  sources: ImportSourceFile[];
  byPath: Map<string, F>;
  /** Files whose head bytes could not be read — a scratched-disc I/O error, a transient read failure, a permission error, a File handle invalidated mid-scan. Never included in `sources`. */
  unreadable: SkippedFile[];
};

export type BuildSourceFilesOptions = {
  /** Files read concurrently at a time; defaults to IMPORT_READ_BATCH_SIZE. Overridable for tests. */
  batchSize?: number;
};

/** How many files' head bytes are read concurrently. A real hospital-CD folder can hold ~7,600 files — one unbounded `Promise.all` would open that many file reads at once (plan 15 round 2); reading in bounded batches keeps memory and open-handle use flat regardless of folder size. */
export const IMPORT_READ_BATCH_SIZE = 32;

/**
 * Reads the head bytes of every file in a chosen folder so `planImport` can
 * classify them, in batches of `batchSize` files at a time rather than all
 * at once. Each file is read independently: a single file whose
 * `slice().arrayBuffer()` rejects is recorded in `unreadable` and does not
 * stop the rest from being read — one bad read must never take down the
 * rest of the folder (plan 15).
 */
export async function buildSourceFiles<F extends ReadableFile>(
  files: F[],
  pathFor: (file: F, index: number) => string,
  options: BuildSourceFilesOptions = {},
): Promise<SourceFilesResult<F>> {
  const batchSize = options.batchSize ?? IMPORT_READ_BATCH_SIZE;
  const byPath = new Map<string, F>();
  const sourcesByIndex: (ImportSourceFile | undefined)[] = new Array(files.length);
  const unreadableByIndex: (SkippedFile | undefined)[] = new Array(files.length);

  const readOne = async (file: F, index: number) => {
    const path = pathFor(file, index);
    byPath.set(path, file);
    try {
      const head = new Uint8Array(await file.slice(0, IMPORT_HEAD_BYTES).arrayBuffer());
      sourcesByIndex[index] = { path, size: file.size, head };
    } catch (error) {
      unreadableByIndex[index] = {
        path,
        reason: `couldn't be read — ${error instanceof Error ? error.message : "unknown error"}`,
      };
    }
  };

  for (let start = 0; start < files.length; start += batchSize) {
    const batch = files.slice(start, start + batchSize);
    await Promise.all(batch.map((file, offset) => readOne(file, start + offset)));
  }

  return {
    sources: sourcesByIndex.filter((source): source is ImportSourceFile => source != null),
    byPath,
    unreadable: unreadableByIndex.filter((skip): skip is SkippedFile => skip != null),
  };
}
