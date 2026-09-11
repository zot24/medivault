export function ownedFileUrl(filePath: string): string {
  return `/api/files/${filePath.split("/").pop()}`;
}
