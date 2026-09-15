export function ownedFileUrl(filePath: string): string {
  return `/api/files/${filePath.split("/").pop()}`;
}

export function documentFileUrl(documentId: number, position: number): string {
  return `/api/documents/${documentId}/files/${position}`;
}

/** One frame of an uncompressed multi-frame file (plan 07), served as an HTTP range read. */
export function documentFrameUrl(
  documentId: number,
  position: number,
  frame: number,
): string {
  return `/api/documents/${documentId}/files/${position}/frames/${frame}`;
}

/** An inclusive batch of frames of an uncompressed multi-frame file (plan 12), served as one HTTP range read. */
export function documentFrameRangeUrl(
  documentId: number,
  position: number,
  from: number,
  to: number,
): string {
  return `/api/documents/${documentId}/files/${position}/frames/${from}-${to}`;
}
