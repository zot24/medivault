export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const DICOM_MIME = "application/dicom";

export const SERIES_TAG_PREFIX = "series:";
export const SLICE_TAG_PREFIX = "slice:";

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

export function newSeriesTag(): string {
  return `${SERIES_TAG_PREFIX}${globalThis.crypto.randomUUID()}`;
}

export function seriesIdFromTags(tags: string[] | null | undefined): string | null {
  const tag = (tags ?? []).find((value) =>
    value.startsWith(SERIES_TAG_PREFIX),
  );
  return tag ? tag.slice(SERIES_TAG_PREFIX.length) : null;
}

export function newSliceTag(index: number): string {
  return `${SLICE_TAG_PREFIX}${index}`;
}

export function sliceIndexFromTags(
  tags: string[] | null | undefined,
): number | null {
  const tag = (tags ?? []).find((value) => value.startsWith(SLICE_TAG_PREFIX));
  if (!tag) {
    return null;
  }
  const index = Number(tag.slice(SLICE_TAG_PREFIX.length));
  return Number.isInteger(index) ? index : null;
}

export function stackDocuments<
  T extends { mimeType: string; fileName: string; tags: string[] | null },
>(focus: T, vault: T[]): T[] {
  const seriesId = seriesIdFromTags(focus.tags);
  if (!seriesId) {
    return [focus];
  }

  const siblings = vault.filter(
    (row) =>
      isDicomDocument(row) && seriesIdFromTags(row.tags) === seriesId,
  );
  const rows = siblings.length === 0 ? [focus] : siblings;
  return [...rows].sort((a, b) => {
    const aIndex = sliceIndexFromTags(a.tags);
    const bIndex = sliceIndexFromTags(b.tags);
    if (aIndex != null && bIndex != null && aIndex !== bIndex) {
      return aIndex - bIndex;
    }
    return a.fileName.localeCompare(b.fileName);
  });
}

export type DocumentBrowseItem<T> =
  | { kind: "file"; document: T }
  | { kind: "series"; seriesId: string; documents: T[] };

export function visibleBrowseItems<
  T extends {
    id: number;
    mimeType: string;
    fileName: string;
    tags: string[] | null;
  },
>(vault: T[], visible: T[]): DocumentBrowseItem<T>[] {
  const visibleIds = new Set(visible.map((row) => row.id));
  return groupDocuments(vault).filter((item) => {
    const rows = item.kind === "series" ? item.documents : [item.document];
    return rows.some((row) => visibleIds.has(row.id));
  });
}

export function groupDocuments<
  T extends { mimeType: string; fileName: string; tags: string[] | null },
>(vault: T[]): DocumentBrowseItem<T>[] {
  const seen = new Set<string>();
  const items: DocumentBrowseItem<T>[] = [];
  for (const document of vault) {
    if (!isDicomDocument(document)) {
      items.push({ kind: "file", document });
      continue;
    }
    const seriesId = seriesIdFromTags(document.tags);
    if (!seriesId) {
      items.push({ kind: "file", document });
      continue;
    }
    if (seen.has(seriesId)) {
      continue;
    }
    seen.add(seriesId);
    items.push({
      kind: "series",
      seriesId,
      documents: stackDocuments(document, vault),
    });
  }
  return items;
}

export function focusSliceIndex<T extends { id: number }>(
  focus: T,
  stack: T[],
): number {
  const index = stack.findIndex((row) => row.id === focus.id);
  return index < 0 ? 0 : index;
}

export function displayTags(tags: string[] | null | undefined): string[] {
  return (tags ?? []).filter(
    (tag) =>
      !tag.startsWith(SERIES_TAG_PREFIX) && !tag.startsWith(SLICE_TAG_PREFIX),
  );
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
