/**
 * MediVault SDK Types
 * These types match the server's database schema
 */

export interface User {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/**
 * Metadata read from the first file of a DICOM series. Never carries a
 * patient identifier or a date — see shared/dicom-meta.ts on the server.
 */
export interface DicomSeriesMeta {
  studyInstanceUid: string;
  seriesInstanceUid: string;
  sopClassUid: string;
  modality: string;
  studyDescription: string;
  seriesDescription: string;
  seriesNumber: number | null;
  rows: number | null;
  columns: number | null;
  numberOfFrames: number;
  /** CineRate fps, else 1000 / FrameTime; null for a still image. */
  frameRate: number | null;
  photometric: string;
  transferSyntaxUid: string;
  sliceThickness: number | null;
  imageType: string[];
  hasOverlay: boolean;
  /** For an SR: what its content tree holds, decided at upload; null for image series. */
  srContent: "report" | "empty-report" | "opaque" | null;
}

export type SeriesGroup =
  | 'volume'
  | 'images'
  | 'snapshot'
  | 'analysis'
  | 'report'
  | 'localizer'
  | 'other';

export interface MedicalDocument {
  id: number;
  userId: string;
  title: string;
  description: string | null;
  documentType: string; // 'lab_result' | 'prescription' | 'x_ray' | 'consultation' | 'other'
  fileName: string;
  filePath: string;
  fileSize: string;
  mimeType: string;
  documentDate: string;
  doctorName: string | null;
  facilityName: string | null;
  tags: string[] | null;
  /** Files in this record; a DICOM series has one per slice. */
  fileCount: number;
  /** Set when the first file is DICOM; null for every other document. */
  dicomMeta: DicomSeriesMeta | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

/** One study — every record sharing a studyInstanceUid. */
export interface StudySummary {
  studyInstanceUid: string;
  modalities: string[];
  studyDescription: string;
  documentDate: string;
  seriesCount: number;
  fileCount: number;
  totalBytes: number;
  primary: MedicalDocument | null;
  groups: Record<SeriesGroup, MedicalDocument[]>;
}

/**
 * A subset of the server's own DicomFrameIndex (server/document-files.ts) —
 * present only for an uncompressed multi-frame file (plan 07 angiography
 * runs). Lets a caller know a file's frame count, and split a batch range
 * read (frameBytes) or size a canvas (rows, columns), without fetching the
 * file itself. windowCenter/Width aren't included — those still come from
 * fetching frame 0.
 */
export interface DocumentFileFrameIndex {
  numberOfFrames: number;
  frameBytes: number;
  rows: number;
  columns: number;
}

/** One file of a document, as listed by GET /api/documents/:id/files. */
export interface DocumentFileEntry {
  position: number;
  fileName: string;
  fileSize: number;
  mimeType: string;
  /** (0008,0018) of a DICOM file; null for non-DICOM files or when absent. */
  sopInstanceUid: string | null;
  instanceNumber: number | null;
  sliceLocation: number | null;
  phase: number | null;
  /** Present only for an uncompressed multi-frame file (plan 07/12). */
  frameIndex: DocumentFileFrameIndex | null;
}

export interface InsertMedicalDocument {
  userId: string;
  title: string;
  description?: string | null;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: string;
  mimeType: string;
  documentDate: string;
  doctorName?: string | null;
  facilityName?: string | null;
  tags?: string[] | null;
}

export interface Symptom {
  id: number;
  userId: string;
  symptomName: string;
  severity: number; // 1-10 scale
  description: string | null;
  location: string | null;
  duration: string | null;
  triggers: string[] | null;
  medications: string[] | null;
  notes: string | null;
  dateRecorded: string;
  timeOfDay: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface InsertSymptom {
  userId: string;
  symptomName: string;
  severity: number;
  description?: string | null;
  location?: string | null;
  duration?: string | null;
  triggers?: string[] | null;
  medications?: string[] | null;
  notes?: string | null;
  dateRecorded: string;
  timeOfDay?: string | null;
}

export interface LoginResponse {
  message: string;
  user: User;
  token?: string; // Only for mobile clients
}

export interface RegisterData {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export type DocumentType = 'lab_result' | 'prescription' | 'x_ray' | 'consultation' | 'other';

export type ShareTtl = '1h' | '24h' | '7d';

export type FrozenSymptom = {
  id: number;
  symptomName: string;
  severity: number;
  description: string | null;
  location: string | null;
  duration: string | null;
  triggers: string[] | null;
  medications: string[] | null;
  notes: string | null;
  dateRecorded: string;
  timeOfDay: string | null;
};

export type SharedFileMeta = {
  id: number;
  title: string;
  fileName: string;
  mimeType: string;
};

export type SharePacket = {
  label: string | null;
  expiresAt: string;
  files: SharedFileMeta[];
  snapshot: FrozenSymptom[] | null;
};

export type MintedShare = {
  id: number;
  documentId: number;
  documentIds: number[];
  label: string | null;
  createdAt: string;
  expiresAt: string;
  token: string;
  path: string;
  symptomSnapshot: FrozenSymptom[] | null;
};

type ListedShareBase = {
  id: number;
  documentId: number;
  documentIds: number[];
  label: string | null;
  createdAt: string;
  expiresAt: string;
  symptomSnapshot: FrozenSymptom[] | null;
};

export type ListedShare =
  | (ListedShareBase & { life: 'live' })
  | (ListedShareBase & { life: 'expired' })
  | (ListedShareBase & { life: 'revoked'; revokedAt: string });

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'lab_result', label: 'Lab Result' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'x_ray', label: 'X-Ray' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
];
