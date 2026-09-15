/**
 * Where a record's files come from: the signed-in owner's own endpoints, or
 * a share token a visitor was given. The viewer, thumbnails, report page and
 * study sections take a FileSource so the same code serves both.
 */
export type FileSource = { kind: "owned" } | { kind: "shared"; token: string };

export const OWNED: FileSource = { kind: "owned" };

export function sharedSource(token: string): FileSource {
  return { kind: "shared", token };
}

function base(source: FileSource, documentId: number): string {
  return source.kind === "owned"
    ? `/api/documents/${documentId}`
    : `/api/s/${encodeURIComponent(source.token)}/documents/${documentId}`;
}

/** GET → the record's files in display order. */
export function filesListUrl(source: FileSource, documentId: number): string {
  return `${base(source, documentId)}/files`;
}

/** GET → the bytes of one file. */
export function fileUrl(source: FileSource, documentId: number, position: number): string {
  return `${base(source, documentId)}/files/${position}`;
}

/** GET → one frame of an uncompressed multi-frame file (range read). */
export function frameUrl(source: FileSource, documentId: number, position: number, frame: number): string {
  return `${base(source, documentId)}/files/${position}/frames/${frame}`;
}

/** GET → an inclusive batch of frames of an uncompressed multi-frame file. */
export function frameRangeUrl(
  source: FileSource,
  documentId: number,
  position: number,
  from: number,
  to: number,
): string {
  return `${base(source, documentId)}/files/${position}/frames/${from}-${to}`;
}

/** A stable string for cache keys that must not mix owner and visitor data. */
export function sourceKey(source: FileSource): string {
  return source.kind === "owned" ? "owned" : `shared:${source.token}`;
}
