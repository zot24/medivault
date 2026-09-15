import type { PublicDocument, SharePacket } from "@/lib/sdk";

/** The raw file behind a shared document, read through the share token. */
export function sharedFileHref(token: string, documentId: number): string {
  return `/api/s/${encodeURIComponent(token)}/files/${documentId}`;
}

/** Where a report inside the shared record opens, keeping the visitor on the share. */
export function sharedReportHref(token: string): (documentId: number) => string {
  return (documentId) => `/s/${encodeURIComponent(token)}/reports/${documentId}`;
}

/** Records that are not part of any study: PDFs, photos, single files. */
export function standaloneDocuments(packet: Pick<SharePacket, "documents" | "studies">): PublicDocument[] {
  const inStudies = new Set(
    packet.studies.flatMap((study) => Object.values(study.groups).flat().map((record) => record.id)),
  );
  return packet.documents.filter((document) => !inStudies.has(document.id));
}
