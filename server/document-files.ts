import { randomUUID } from "crypto";
import fs from "fs";
import {
  insertMedicalDocumentSchema,
  type DocumentFile,
  type InsertDocumentFile,
  type InsertMedicalDocument,
  type MedicalDocument,
} from "@shared/schema";
import { readFileMeta, readSeriesMeta, readSopInstanceUid } from "@shared/dicom-meta";
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

/**
 * A file to upload, either already in memory (small: PDFs, images, a
 * single DICOM slice) or on disk with a known size (a large uncompressed
 * angiography cine run — plan 07 — that multer wrote to the OS temp dir
 * rather than buffering). classifyFiles reads only a bounded head of a
 * disk-backed file, never the whole thing; putAll streams it to the object
 * store the same way.
 */
export type UploadFile = {
  mimeType: string;
  originalName: string;
} & ({ bytes: Buffer } | { path: string; size: number });

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

/** One decoded-ready frame of an uncompressed multi-frame DICOM file (plan 07). */
export type OwnedFrameBytes = {
  bytes: Buffer;
  rows: number;
  columns: number;
  bitsAllocated: number;
  photometric: string;
  windowCenter: number;
  windowWidth: number;
};

export type RemoveDocumentResult = "deleted" | "not_found";

export type AppendFilesResult =
  | { kind: "appended"; fileCount: number }
  | { kind: "not_found" }
  | { kind: "rejected"; message: string };

const SERIES_KIND_MESSAGE = "All files in a series must be DICOM.";
const APPEND_KIND_MESSAGE = "Only DICOM series accept more files.";

type ClassifiedFile = {
  mimeType: string;
  originalName: string;
  key: ObjectKey;
  size: number;
  /**
   * The whole file for a buffer-based upload, or up to HEAD_BYTES read from
   * the front of a disk-based one — enough for classifyUpload's Part-10
   * sniff and for readFileMeta/readSeriesMeta, both of which read only
   * header elements that come before the pixel data.
   */
  metaBytes: Buffer;
} & ({ bytes: Buffer } | { path: string });

/**
 * Enough of a DICOM file to read every header element readFileMeta and
 * readSeriesMeta look at (they stop at the pixel data tag) — see
 * shared/dicom-meta.ts. Bigger than the 132 bytes classifyUpload strictly
 * needs so one disk read covers both.
 */
const HEAD_BYTES = 1024 * 1024;

/** Reads up to `maxBytes` from the front of a file without loading the rest. */
function readHeadSync(filePath: string, maxBytes: number): Buffer {
  const fd = fs.openSync(filePath, "r");
  try {
    const length = Math.min(maxBytes, fs.fstatSync(fd).size);
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Validates every file up front so a bad slice fails the request before any
 * object is written. A multi-file upload is a DICOM series by definition.
 */
function classifyFiles(userId: string, files: UploadFile[]): ClassifiedFile[] {
  if (files.length === 0) {
    throw new Error("No file uploaded");
  }
  const classified = files.map((file) => {
    const size = "bytes" in file ? file.bytes.length : file.size;
    const metaBytes = "bytes" in file ? file.bytes : readHeadSync(file.path, HEAD_BYTES);
    const kind = classifyUpload({
      mimeType: file.mimeType,
      originalName: file.originalName,
      bytes: metaBytes,
    });
    if (!kind) {
      throw new Error(
        "Invalid file type. Only PDF, image, and DICOM files are allowed.",
      );
    }
    if (!fitsUploadCap(size, kind.mimeType)) {
      throw new Error("File too large");
    }
    const base = {
      mimeType: kind.mimeType,
      originalName: file.originalName,
      key: objectKeyFor(userId, newObjectBasename(kind.mimeType, file.originalName)),
      size,
      metaBytes,
    };
    return "bytes" in file ? { ...base, bytes: file.bytes } : { ...base, path: file.path };
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
    const isDicom = file.mimeType === DICOM_MIME;
    const fileMeta = isDicom ? readFileMeta(file.metaBytes) : null;
    return {
      documentId,
      position: startPosition + index,
      fileName: file.originalName,
      filePath: file.key,
      fileSize: file.size,
      mimeType: file.mimeType,
      sopInstanceUid: isDicom ? readSopInstanceUid(file.metaBytes) : null,
      instanceNumber: fileMeta?.instanceNumber ?? null,
      sliceLocation: fileMeta?.sliceLocation ?? null,
      phase: fileMeta?.phase ?? null,
      frameIndex: fileMeta?.frameIndex ?? null,
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

/**
 * Streams a disk-backed file straight to the object store instead of
 * reading it into memory first — the point of the whole detour through
 * multer.diskStorage for a ~100 MB angiography run (plan 07). Either way,
 * the OS temp file is gone once this returns, success or failure.
 */
async function putAll(objects: ObjectStore, files: ClassifiedFile[]) {
  await Promise.all(
    files.map(async (file) => {
      try {
        if ("path" in file) {
          await objects.put({
            key: file.key,
            stream: fs.createReadStream(file.path),
            size: file.size,
            contentType: file.mimeType,
          });
        } else {
          await objects.put({
            key: file.key,
            bytes: file.bytes,
            contentType: file.mimeType,
          });
        }
      } finally {
        if ("path" in file) {
          await fs.promises.unlink(file.path).catch(() => {});
        }
      }
    }),
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
      const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      const dicomMeta =
        first.mimeType === DICOM_MIME ? readSeriesMeta(first.metaBytes) : null;
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
        files.reduce((sum, file) => sum + file.size, 0);
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

    /**
     * One frame of an uncompressed multi-frame file, read as a fixed byte
     * range (plan 07) — never the whole ~100 MB file. Null for a position
     * with no frame index (a still, or a compressed multi-frame file —
     * those are small enough to fetch whole, see openOwnedFileAt) and for a
     * frame index out of range.
     */
    async openOwnedFrame(
      userId: string,
      documentId: number,
      position: number,
      frame: number,
    ): Promise<OwnedFrameBytes | null> {
      const document = await deps.documents.get(documentId, userId);
      if (!document) {
        return null;
      }
      const files = await deps.documents.listFiles(documentId);
      const row = files.find((file) => file.position === position);
      const frameIndex = row?.frameIndex;
      if (!row || !frameIndex || frame < 0 || frame >= frameIndex.numberOfFrames) {
        return null;
      }
      const start = frameIndex.pixelDataOffset + frame * frameIndex.frameBytes;
      const end = start + frameIndex.frameBytes - 1;
      const bytes = await deps.objects.getRange(asObjectKey(row.filePath), start, end);
      if (!bytes || bytes.length !== frameIndex.frameBytes) {
        return null;
      }
      return {
        bytes,
        rows: frameIndex.rows,
        columns: frameIndex.columns,
        bitsAllocated: frameIndex.bitsAllocated,
        photometric: document.dicomMeta?.photometric || "MONOCHROME2",
        windowCenter: frameIndex.windowCenter,
        windowWidth: frameIndex.windowWidth,
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
