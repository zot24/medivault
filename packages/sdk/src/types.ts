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
  createdAt: Date | null;
  updatedAt: Date | null;
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

export type MintedShare = {
  id: number;
  documentId: number;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  token: string;
  path: string;
};

export type ListedShare =
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: string;
      expiresAt: string;
      life: 'live';
    }
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: string;
      expiresAt: string;
      life: 'expired';
    }
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: string;
      expiresAt: string;
      revokedAt: string;
      life: 'revoked';
    };

export const DOCUMENT_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'lab_result', label: 'Lab Result' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'x_ray', label: 'X-Ray' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'other', label: 'Other' },
];
