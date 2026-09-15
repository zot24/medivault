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

/**
 * Reads the head bytes of every file in a chosen folder so `planImport` can
 * classify them. Each file is read independently: a single file whose
 * `slice().arrayBuffer()` rejects is recorded in `unreadable` and does not
 * stop the rest from being read — a real hospital-CD folder can have ~7,600
 * files, and one bad read must never take down the other 7,599 (plan 15).
 */
export async function buildSourceFiles<F extends ReadableFile>(
  files: F[],
  pathFor: (file: F, index: number) => string,
): Promise<SourceFilesResult<F>> {
  const byPath = new Map<string, F>();
  const sourcesByIndex: (ImportSourceFile | undefined)[] = new Array(files.length);
  const unreadableByIndex: (SkippedFile | undefined)[] = new Array(files.length);

  await Promise.all(
    files.map(async (file, index) => {
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
    }),
  );

  return {
    sources: sourcesByIndex.filter((source): source is ImportSourceFile => source != null),
    byPath,
    unreadable: unreadableByIndex.filter((skip): skip is SkippedFile => skip != null),
  };
}
