import { randomUUID } from "crypto";
import {
  insertMedicalDocumentSchema,
  type InsertMedicalDocument,
  type MedicalDocument,
} from "@shared/schema";
import {
  asObjectKey,
  type ObjectKey,
  type ObjectStore,
} from "./object-store";

const MAX_BYTES = 10 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

export type DocumentRecords = {
  create(document: InsertMedicalDocument): Promise<MedicalDocument>;
  findByFilePath(
    userId: string,
    filePath: string,
  ): Promise<MedicalDocument | undefined>;
  get(id: number, userId: string): Promise<MedicalDocument | undefined>;
  delete(id: number, userId: string): Promise<boolean>;
};

export type UploadDocumentInput = {
  userId: string;
  bytes: Buffer;
  mimeType: string;
  originalName: string;
  title: string;
  description?: string;
  documentType: string;
  documentDate: string;
  doctorName?: string;
  facilityName?: string;
  tags: string[];
};

export type OwnedFileBytes = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

export type RemoveDocumentResult = "deleted" | "not_found";

export function parseObjectBasename(raw: string): string | null {
  if (!raw || raw.length > 180) {
    return null;
  }
  if (raw.includes("/") || raw.includes("\\") || raw.includes("..")) {
    return null;
  }
  if (!/^[\w-]+\.(pdf|jpe?g|png|gif|webp)$/i.test(raw)) {
    return null;
  }
  return raw;
}

export function objectKeyFor(userId: string, basename: string): ObjectKey {
  return asObjectKey(`${userId}/${basename}`);
}

export function newObjectBasename(mimeType: string): string {
  const ext = MIME_EXT[mimeType];
  if (!ext) {
    throw new Error("Invalid file type. Only PDF and image files are allowed.");
  }
  return `${randomUUID()}${ext}`;
}

export function createDocumentFiles(deps: {
  objects: ObjectStore;
  documents: DocumentRecords;
}) {
  return {
    async uploadOwnedDocument(
      input: UploadDocumentInput,
    ): Promise<MedicalDocument> {
      if (input.bytes.length > MAX_BYTES) {
        throw new Error("File too large");
      }

      const basename = newObjectBasename(input.mimeType);
      const key = objectKeyFor(input.userId, basename);
      const documentData = insertMedicalDocumentSchema.parse({
        userId: input.userId,
        title: input.title,
        description: input.description,
        documentType: input.documentType,
        fileName: input.originalName,
        filePath: key,
        fileSize: input.bytes.length.toString(),
        mimeType: input.mimeType,
        documentDate: input.documentDate,
        doctorName: input.doctorName,
        facilityName: input.facilityName,
        tags: input.tags,
      });

      await deps.objects.put({
        key,
        bytes: input.bytes,
        contentType: input.mimeType,
      });

      try {
        return await deps.documents.create(documentData);
      } catch (error) {
        await deps.objects.delete(key);
        throw error;
      }
    },

    async openOwnedFile(
      userId: string,
      filename: string,
    ): Promise<OwnedFileBytes | null> {
      const basename = parseObjectBasename(filename);
      if (!basename) {
        return null;
      }

      const key = objectKeyFor(userId, basename);
      const document = await deps.documents.findByFilePath(userId, key);
      if (!document) {
        return null;
      }

      const stored = await deps.objects.get(asObjectKey(document.filePath));
      if (!stored) {
        return null;
      }

      return {
        bytes: stored.bytes,
        mimeType: document.mimeType,
        fileName: document.fileName,
      };
    },

    async removeOwnedDocument(
      userId: string,
      documentId: number,
    ): Promise<RemoveDocumentResult> {
      const document = await deps.documents.get(documentId, userId);
      if (!document) {
        return "not_found";
      }

      const deleted = await deps.documents.delete(documentId, userId);
      if (!deleted) {
        return "not_found";
      }

      await deps.objects.delete(asObjectKey(document.filePath));
      return "deleted";
    },
  };
}
