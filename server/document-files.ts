import { randomUUID } from "crypto";
import {
  insertMedicalDocumentSchema,
  type DocumentFile,
  type InsertDocumentFile,
  type InsertMedicalDocument,
  type MedicalDocument,
} from "@shared/schema";
import { readFileMeta, readSeriesMeta } from "@shared/dicom-meta";
import {
  DICOM_MIME,
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
  createFiles(files: InsertDocumentFile[]): Promise<DocumentFile[]>;
  /** Ordered by position. */
  listFiles(documentId: number): Promise<DocumentFile[]>;
  updateTotals(
    id: number,
    totals: { fileCount: number; fileSize: string },
  ): Promise<void>;
};

export type UploadFile = {
  bytes: Buffer;
  mimeType: string;
  originalName: string;
};

export type UploadDocumentInput = {
  userId: string;
  /** One file for an ordinary document; many (all DICOM) for a series. */
  files: UploadFile[];
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

export type AppendFilesResult =
  | { kind: "appended"; fileCount: number }
  | { kind: "not_found" }
  | { kind: "rejected"; message: string };

const SERIES_KIND_MESSAGE = "All files in a series must be DICOM.";
const APPEND_KIND_MESSAGE = "Only DICOM series accept more files.";

type ClassifiedFile = UploadFile & { mimeType: string; key: ObjectKey };

/**
 * Validates every file up front so a bad slice fails the request before any
 * object is written. A multi-file upload is a DICOM series by definition.
 */
function classifyFiles(userId: string, files: UploadFile[]): ClassifiedFile[] {
  if (files.length === 0) {
    throw new Error("No file uploaded");
  }
  const classified = files.map((file) => {
    if (!fitsUploadCap(file.bytes.length)) {
      throw new Error("File too large");
    }
    const kind = classifyUpload({
      mimeType: file.mimeType,
      originalName: file.originalName,
      bytes: file.bytes,
    });
    if (!kind) {
      throw new Error(
        "Invalid file type. Only PDF, image, and DICOM files are allowed.",
      );
    }
    return {
      ...file,
      mimeType: kind.mimeType,
      key: objectKeyFor(
        userId,
        newObjectBasename(kind.mimeType, file.originalName),
      ),
    };
  });
  if (
    classified.length > 1 &&
    classified.some((file) => file.mimeType !== DICOM_MIME)
  ) {
    throw new Error(SERIES_KIND_MESSAGE);
  }
  return classified;
}

function fileRows(
  documentId: number,
  startPosition: number,
  files: ClassifiedFile[],
): InsertDocumentFile[] {
  return files.map((file, index) => {
    const fileMeta = file.mimeType === DICOM_MIME ? readFileMeta(file.bytes) : null;
    return {
      documentId,
      position: startPosition + index,
      fileName: file.originalName,
      filePath: file.key,
      fileSize: file.bytes.length,
      mimeType: file.mimeType,
      instanceNumber: fileMeta?.instanceNumber ?? null,
      sliceLocation: fileMeta?.sliceLocation ?? null,
      phase: fileMeta?.phase ?? null,
    };
  });
}

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

async function putAll(objects: ObjectStore, files: ClassifiedFile[]) {
  await Promise.all(
    files.map((file) =>
      objects.put({
        key: file.key,
        bytes: file.bytes,
        contentType: file.mimeType,
      }),
    ),
  );
}

async function deleteAll(objects: ObjectStore, keys: ObjectKey[]) {
  await Promise.all(keys.map((key) => objects.delete(key)));
}

export function createDocumentFiles(deps: {
  objects: ObjectStore;
  documents: DocumentRecords;
}) {
  return {
    async uploadOwnedDocument(
      input: UploadDocumentInput,
    ): Promise<MedicalDocument> {
      const files = classifyFiles(input.userId, input.files);
      const [first] = files;
      const totalBytes = files.reduce((sum, file) => sum + file.bytes.length, 0);
      const dicomMeta =
        first.mimeType === DICOM_MIME ? readSeriesMeta(first.bytes) : null;
      const documentData = insertMedicalDocumentSchema.parse({
        userId: input.userId,
        title: input.title,
        description: input.description,
        documentType: input.documentType,
        fileName: first.originalName,
        filePath: first.key,
        fileSize: totalBytes.toString(),
        mimeType: first.mimeType,
        documentDate: input.documentDate,
        doctorName: input.doctorName,
        facilityName: input.facilityName,
        tags: input.tags,
        fileCount: files.length,
        dicomMeta,
      });

      await putAll(deps.objects, files);

      try {
        const document = await deps.documents.create(documentData);
        await deps.documents.createFiles(fileRows(document.id, 0, files));
        return document;
      } catch (error) {
        await deleteAll(deps.objects, files.map((file) => file.key));
        throw error;
      }
    },

    async appendOwnedFiles(
      userId: string,
      documentId: number,
      input: UploadFile[],
    ): Promise<AppendFilesResult> {
      const document = await deps.documents.get(documentId, userId);
      if (!document) {
        return { kind: "not_found" };
      }
      if (document.mimeType !== DICOM_MIME) {
        return { kind: "rejected", message: APPEND_KIND_MESSAGE };
      }
      const files = classifyFiles(userId, input);
      if (files.some((file) => file.mimeType !== DICOM_MIME)) {
        return { kind: "rejected", message: SERIES_KIND_MESSAGE };
      }

      const existing = await deps.documents.listFiles(documentId);
      const start = existing.reduce((max, row) => Math.max(max, row.position + 1), 0);
      await putAll(deps.objects, files);
      try {
        await deps.documents.createFiles(fileRows(documentId, start, files));
      } catch (error) {
        await deleteAll(deps.objects, files.map((file) => file.key));
        throw error;
      }

      const fileCount = existing.length + files.length;
      const fileSize =
        existing.reduce((sum, row) => sum + row.fileSize, 0) +
        files.reduce((sum, file) => sum + file.bytes.length, 0);
      await deps.documents.updateTotals(documentId, {
        fileCount,
        fileSize: fileSize.toString(),
      });
      return { kind: "appended", fileCount };
    },

    async listOwnedFiles(
      userId: string,
      documentId: number,
    ): Promise<DocumentFile[] | null> {
      const document = await deps.documents.get(documentId, userId);
      if (!document) {
        return null;
      }
      return deps.documents.listFiles(documentId);
    },

    async openOwnedFileAt(
      userId: string,
      documentId: number,
      position: number,
    ): Promise<OwnedFileBytes | null> {
      const rows = await this.listOwnedFiles(userId, documentId);
      const row = rows?.find((file) => file.position === position);
      if (!row) {
        return null;
      }
      const stored = await deps.objects.get(asObjectKey(row.filePath));
      if (!stored) {
        return null;
      }
      return {
        bytes: stored.bytes,
        mimeType: row.mimeType,
        fileName: row.fileName,
      };
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

      const files = await deps.documents.listFiles(documentId);
      const deleted = await deps.documents.delete(documentId, userId);
      if (!deleted) {
        return "not_found";
      }

      const keys = new Set<string>([
        document.filePath,
        ...files.map((row) => row.filePath),
      ]);
      await deleteAll(deps.objects, Array.from(keys, asObjectKey));
      return "deleted";
    },
  };
}
