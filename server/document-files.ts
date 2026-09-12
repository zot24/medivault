import { randomUUID } from "crypto";
import {
  insertMedicalDocumentSchema,
  type InsertMedicalDocument,
  type MedicalDocument,
} from "@shared/schema";
import {
  acceptedExtensions,
  classifyUpload,
  fitsUploadCap,
} from "@shared/upload-kinds";
import {
  asObjectKey,
  type ObjectKey,
  type ObjectStore,
} from "./object-store";

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
  const extension = raw.includes(".")
    ? `.${raw.split(".").pop()!.toLowerCase()}`
    : "";
  const allowed = new Set([...acceptedExtensions(), ".jpeg"]);
  if (!allowed.has(extension) || !/^[\w-]+\.[a-z0-9]+$/i.test(raw)) {
    return null;
  }
  return raw;
}

export function objectKeyFor(userId: string, basename: string): ObjectKey {
  return asObjectKey(`${userId}/${basename}`);
}

export function newObjectBasename(
  mimeType: string,
  originalName = "",
): string {
  const classified = classifyUpload({ mimeType, originalName });
  if (!classified) {
    throw new Error(
      "Invalid file type. Only PDF, image, and DICOM files are allowed.",
    );
  }
  return `${randomUUID()}${classified.extension}`;
}

export function createDocumentFiles(deps: {
  objects: ObjectStore;
  documents: DocumentRecords;
}) {
  return {
    async uploadOwnedDocument(
      input: UploadDocumentInput,
    ): Promise<MedicalDocument> {
      if (!fitsUploadCap(input.bytes.length)) {
        throw new Error("File too large");
      }

      const classified = classifyUpload({
        mimeType: input.mimeType,
        originalName: input.originalName,
        bytes: input.bytes,
      });
      if (!classified) {
        throw new Error(
          "Invalid file type. Only PDF, image, and DICOM files are allowed.",
        );
      }

      const basename = newObjectBasename(
        classified.mimeType,
        input.originalName,
      );
      const key = objectKeyFor(input.userId, basename);
      const documentData = insertMedicalDocumentSchema.parse({
        userId: input.userId,
        title: input.title,
        description: input.description,
        documentType: input.documentType,
        fileName: input.originalName,
        filePath: key,
        fileSize: input.bytes.length.toString(),
        mimeType: classified.mimeType,
        documentDate: input.documentDate,
        doctorName: input.doctorName,
        facilityName: input.facilityName,
        tags: input.tags,
      });

      await deps.objects.put({
        key,
        bytes: input.bytes,
        contentType: classified.mimeType,
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
