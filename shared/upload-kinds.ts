import type { SeriesKind } from "./series-kind";

/** "2026-09-11" -> a Date at local midnight, so calendar dates don't shift with the timezone. */
export function localDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/**
 * Uncompressed angiography cine runs are ~100 MB (plan 07); PDF/image caps
 * stay at MAX_UPLOAD_BYTES. Multer enforces this one as its `fileSize`
 * limit for every field; `fitsUploadCap` enforces the lower one for
 * non-DICOM files after classification.
 */
export const MAX_DICOM_UPLOAD_BYTES = 256 * 1024 * 1024;
export const DICOM_MIME = "application/dicom";
/** Slices per upload request; the server enforces the same cap. */
export const MAX_FILES_PER_REQUEST = 50;

/**
 * Total size of every file in one multipart request, across all of
 * MAX_FILES_PER_REQUEST slices — multer's own `fileSize` limit caps one
 * file at MAX_DICOM_UPLOAD_BYTES, but a request of 50 files each near that
 * cap would still total multiple GB. Checked by summing `req.files` sizes
 * after multer has already written them to disk (server/upload-middleware.ts);
 * rejected with 413 before any of them reaches the object store.
 */
export const MAX_REQUEST_UPLOAD_BYTES = 512 * 1024 * 1024;

/** True when the summed size of every file in a request exceeds `capBytes`. */
export function exceedsAggregateUploadCap(
  sizes: number[],
  capBytes: number = MAX_REQUEST_UPLOAD_BYTES,
): boolean {
  return sizes.reduce((sum, size) => sum + size, 0) > capBytes;
}

export type ClassifiedUpload = {
  mimeType: string;
  extension: string;
};

type UploadKind = {
  mimeType: string;
  extension: string;
  aliases: string[];
};

const UPLOAD_KINDS: UploadKind[] = [
  { mimeType: "application/pdf", extension: ".pdf", aliases: [] },
  { mimeType: "image/jpeg", extension: ".jpg", aliases: ["image/jpg"] },
  { mimeType: "image/png", extension: ".png", aliases: [] },
  { mimeType: "image/gif", extension: ".gif", aliases: [] },
  { mimeType: "image/webp", extension: ".webp", aliases: [] },
  {
    mimeType: "application/dicom",
    extension: ".dcm",
    aliases: ["application/dicom+json"],
  },
];

const MIME_BY_ALIAS = new Map<string, UploadKind>();
for (const kind of UPLOAD_KINDS) {
  MIME_BY_ALIAS.set(kind.mimeType, kind);
  for (const alias of kind.aliases) {
    MIME_BY_ALIAS.set(alias, kind);
  }
}

export function acceptedExtensions(): string[] {
  return UPLOAD_KINDS.map((kind) => kind.extension);
}

export function acceptAttribute(): string {
  return [
    ...acceptedExtensions(),
    ".jpeg",
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/dicom",
  ].join(",");
}

export const PART10_SNIFF_BYTES = 132;
const PART10_MAGIC = 128;

export function isPart10(bytes: Uint8Array | undefined): boolean {
  if (!bytes || bytes.length < PART10_MAGIC + 4) {
    return false;
  }
  return (
    bytes[PART10_MAGIC] === 0x44 &&
    bytes[PART10_MAGIC + 1] === 0x49 &&
    bytes[PART10_MAGIC + 2] === 0x43 &&
    bytes[PART10_MAGIC + 3] === 0x4d
  );
}

export function isVagueUploadMime(mime: string): boolean {
  return mime === "" || mime === "application/octet-stream";
}

export function classifyUpload(input: {
  mimeType: string;
  originalName: string;
  bytes?: Uint8Array;
}): ClassifiedUpload | null {
  const mime = input.mimeType.trim().toLowerCase();
  const ext = extensionOf(input.originalName);

  const byMime = MIME_BY_ALIAS.get(mime);
  if (byMime) {
    return { mimeType: byMime.mimeType, extension: byMime.extension };
  }

  const vague = isVagueUploadMime(mime);
  if (ext === ".dcm" && vague) {
    return { mimeType: "application/dicom", extension: ".dcm" };
  }

  if ((vague || ext === "") && isPart10(input.bytes)) {
    return { mimeType: "application/dicom", extension: ".dcm" };
  }

  return null;
}

/** DICOM files get the higher MAX_DICOM_UPLOAD_BYTES cap; everything else MAX_UPLOAD_BYTES. */
export function fitsUploadCap(byteLength: number, mimeType: string): boolean {
  const cap = mimeType === DICOM_MIME ? MAX_DICOM_UPLOAD_BYTES : MAX_UPLOAD_BYTES;
  return byteLength <= cap;
}

export function isDicomDocument(input: {
  mimeType: string;
  fileName: string;
  bytes?: Uint8Array;
}): boolean {
  return (
    classifyUpload({
      mimeType: input.mimeType,
      originalName: input.fileName,
      bytes: input.bytes,
    })?.mimeType === "application/dicom"
  );
}

export type SeriesUploadSummary = {
  slices: number;
  totalBytes: number;
  /** Requests the browser will make: one to create, then one per extra chunk. */
  requests: number;
  sizeLabel: string;
};

/** Above this the dialog warns that the upload is heavy and should not be interrupted. */
export const HEAVY_UPLOAD_BYTES = 100 * 1024 * 1024;

export function describeSeriesUpload(
  files: { size: number }[],
): SeriesUploadSummary {
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  return {
    slices: files.length,
    totalBytes,
    requests: Math.max(1, Math.ceil(files.length / MAX_FILES_PER_REQUEST)),
    sizeLabel: formatBytes(totalBytes),
  };
}

export function isHeavyUpload(summary: SeriesUploadSummary): boolean {
  return summary.totalBytes >= HEAVY_UPLOAD_BYTES;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function chunkFiles<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

/**
 * The file-count line for a record, worded for what its files actually are
 * (plan 13) — a volume's files are slices, an echocardiogram's are views, an
 * angiography record's are runs, and so on. Replaces the old, DICOM-kind-
 * blind `sliceCountLabel`. `n` is the record's file count; `frames` means a
 * different thing per kind (there being nothing else to pass it as, since
 * every kind already spends its two required numbers): the slice count of
 * *one phase* for "phases" (so the phase count is `n / frames`), or the
 * summed frame count across every run for "runs" — omit it for every other
 * kind, or when it isn't known yet.
 */
export function countLabel(kind: SeriesKind, n: number, frames?: number | null): string {
  switch (kind) {
    case "volume":
      return n === 1 ? "1 slice" : `${n} slices`;
    case "phases": {
      const perPhase = frames && frames > 0 ? frames : n;
      const phaseCount = frames && frames > 0 ? Math.round(n / frames) : 1;
      if (phaseCount <= 1) {
        return perPhase === 1 ? "1 slice" : `${perPhase} slices`;
      }
      return `${phaseCount} phases × ${perPhase} slices`;
    }
    case "views":
      return n === 1 ? "1 view" : `${n} views`;
    case "runs": {
      const runs = n === 1 ? "1 run" : `${n} runs`;
      if (frames == null) {
        return runs;
      }
      return `${runs} · ${frames === 1 ? "1 frame" : `${frames} frames`}`;
    }
    case "single":
      return "1 image";
    case "report":
      return n === 1 ? "1 report" : `${n} reports`;
  }
}

export function stepSliceIndex(
  current: number,
  delta: number,
  length: number,
): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, current + delta));
}

/**
 * Next unloaded slice, nearest to `around` first, so the one on screen and
 * its neighbours arrive before the far ends of the stack.
 */
export function nextSliceToLoad(
  around: number,
  count: number,
  taken: (position: number) => boolean,
): number | null {
  for (let distance = 0; distance < count; distance += 1) {
    const after = around + distance;
    if (after < count && !taken(after)) {
      return after;
    }
    const before = around - distance;
    if (distance > 0 && before >= 0 && !taken(before)) {
      return before;
    }
  }
  return null;
}

export function sliceDeltaFromKey(key: string): number | null {
  if (key === "ArrowRight" || key === "ArrowDown") {
    return 1;
  }
  if (key === "ArrowLeft" || key === "ArrowUp") {
    return -1;
  }
  return null;
}

function extensionOf(name: string): string {
  const match = /\.[^.]+$/.exec(name);
  return match ? match[0].toLowerCase() : "";
}
