/** "2026-09-11" -> a Date at local midnight, so calendar dates don't shift with the timezone. */
export function localDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const DICOM_MIME = "application/dicom";
/** Slices per upload request; the server enforces the same cap. */
export const MAX_FILES_PER_REQUEST = 50;

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

export function fitsUploadCap(byteLength: number): boolean {
  return byteLength <= MAX_UPLOAD_BYTES;
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

export function sliceCountLabel(count: number): string {
  return count === 1 ? "1 slice" : `${count} slices`;
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
