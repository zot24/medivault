export function ownedFileUrl(filePath: string): string {
  return `/api/files/${filePath.split("/").pop()}`;
}

export function documentFileUrl(documentId: number, position: number): string {
  return `/api/documents/${documentId}/files/${position}`;
}
