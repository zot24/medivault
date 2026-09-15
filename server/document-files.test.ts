import fs from "fs";
import os from "os";
import path from "path";
import { describe, expect, it } from "vitest";
import { buildMiniCtDicom } from "@shared/mini-ct-dicom";
import {
  createDocumentFiles,
  objectKeyFor,
  parseObjectBasename,
} from "./document-files";
import { MemoryObjectStore, asObjectKey } from "./object-store";
import type {
  DocumentFile,
  InsertDocumentFile,
  InsertMedicalDocument,
  MedicalDocument,
} from "@shared/schema";

function fakeDocument(
  overrides: Partial<MedicalDocument> & Pick<MedicalDocument, "userId" | "filePath">,
): MedicalDocument {
  return {
    id: 1,
    title: "Lab Results",
    description: null,
    documentType: "lab_result",
    fileName: "labs.pdf",
    fileSize: "4",
    mimeType: "application/pdf",
    documentDate: "2026-09-11",
    doctorName: null,
    facilityName: null,
    tags: [],
    fileCount: 1,
    dicomMeta: null,
    createdAt: new Date("2026-09-11T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
    ...overrides,
  };
}

function memoryRecords(rows: MedicalDocument[] = []) {
  const documents = [...rows];
  const files: DocumentFile[] = [];
  let nextId = documents.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  let nextFileId = 1;

  return {
    documents,
    files,
    records: {
      async createFiles(inputs: InsertDocumentFile[]): Promise<DocumentFile[]> {
        const created = inputs.map((input) => ({
          id: nextFileId++,
          documentId: input.documentId,
          position: input.position,
          fileName: input.fileName,
          filePath: input.filePath,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          sopInstanceUid: input.sopInstanceUid ?? null,
          instanceNumber: input.instanceNumber ?? null,
          sliceLocation: input.sliceLocation ?? null,
          phase: input.phase ?? null,
          frameIndex: input.frameIndex ?? null,
          createdAt: new Date("2026-09-11T00:00:00.000Z"),
        }));
        files.push(...created);
        return created;
      },
      async listFiles(documentId: number): Promise<DocumentFile[]> {
        return files
          .filter((row) => row.documentId === documentId)
          .sort((a, b) => a.position - b.position);
      },
      async updateTotals(
        id: number,
        totals: { fileCount: number; fileSize: string },
      ): Promise<void> {
        const row = documents.find((doc) => doc.id === id);
        if (row) {
          row.fileCount = totals.fileCount;
          row.fileSize = totals.fileSize;
        }
      },
      async create(input: InsertMedicalDocument): Promise<MedicalDocument> {
        const row = fakeDocument({
          id: nextId++,
          userId: input.userId,
          title: input.title,
          description: input.description ?? null,
          documentType: input.documentType,
          fileName: input.fileName,
          filePath: input.filePath,
          fileSize: input.fileSize,
          mimeType: input.mimeType,
          documentDate: input.documentDate,
          doctorName: input.doctorName ?? null,
          facilityName: input.facilityName ?? null,
          tags: input.tags ?? [],
          fileCount: input.fileCount ?? 1,
          dicomMeta: input.dicomMeta ?? null,
        });
        documents.push(row);
        return row;
      },
      async findByFilePath(userId: string, filePath: string) {
        return documents.find(
          (row) => row.userId === userId && row.filePath === filePath,
        );
      },
      async get(id: number, userId: string) {
        return documents.find((row) => row.id === id && row.userId === userId);
      },
      async delete(id: number, userId: string) {
        const index = documents.findIndex(
          (row) => row.id === id && row.userId === userId,
        );
        if (index === -1) {
          return false;
        }
        documents.splice(index, 1);
        for (let i = files.length - 1; i >= 0; i--) {
          if (files[i].documentId === id) files.splice(i, 1);
        }
        return true;
      },
    },
  };
}

describe("parseObjectBasename", () => {
  it("accepts a uuid plus extension", () => {
    expect(
      parseObjectBasename("a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf"),
    ).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf");
  });

  it("rejects a path traversal filename", () => {
    expect(parseObjectBasename("../secret.pdf")).toBeNull();
    expect(parseObjectBasename("a/b.pdf")).toBeNull();
  });

  it("accepts a stored dicom basename", () => {
    expect(
      parseObjectBasename("a1b2c3d4-e5f6-7890-abcd-ef1234567890.dcm"),
    ).toBe("a1b2c3d4-e5f6-7890-abcd-ef1234567890.dcm");
  });
});

describe("createDocumentFiles", () => {
  it("stores bytes and returns them only to the owning user", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      files: [{ bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "labs.pdf" }],
      title: "Lab Results",
      documentType: "lab_result",
      documentDate: "2026-09-11",
      tags: [],
    });

    expect(created.filePath).toBe(
      objectKeyFor("owner-1", created.filePath.split("/").pop()!),
    );
    expect(created.filePath.startsWith("owner-1/")).toBe(true);
    expect(created.fileName).toBe("labs.pdf");

    const basename = created.filePath.split("/").pop()!;
    const owned = await files.openOwnedFile("owner-1", basename);
    expect(owned).toEqual({
      bytes: Buffer.from("%PDF-1"),
      mimeType: "application/pdf",
      fileName: "labs.pdf",
    });

    const otherUser = await files.openOwnedFile("intruder-2", basename);
    expect(otherUser).toBeNull();

    const missingObject = await objects.get(
      asObjectKey(objectKeyFor("intruder-2", basename)),
    );
    expect(missingObject).toBeNull();
  });

  it("does not open a file by basename when no owned row exists", async () => {
    const objects = new MemoryObjectStore();
    const basename = "a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf";
    await objects.put({
      key: asObjectKey(`victim-9/${basename}`),
      bytes: Buffer.from("secret"),
      contentType: "application/pdf",
    });
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    expect(await files.openOwnedFile("intruder-2", basename)).toBeNull();
  });

  it("deletes the row and the object for the owner", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      files: [{ bytes: Buffer.from("%PDF-2"), mimeType: "application/pdf", originalName: "labs.pdf" }],
      title: "Lab Results",
      documentType: "lab_result",
      documentDate: "2026-09-11",
      tags: [],
    });

    expect(await files.removeOwnedDocument("intruder-2", created.id)).toBe(
      "not_found",
    );
    expect(await files.removeOwnedDocument("owner-1", created.id)).toBe(
      "deleted",
    );
    expect(await objects.get(asObjectKey(created.filePath))).toBeNull();
    expect(
      await files.openOwnedFile("owner-1", created.filePath.split("/").pop()!),
    ).toBeNull();
  });

  it("stores dicom bytes and returns them only to the owning user", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      files: [{ bytes: Buffer.from("DICM"), mimeType: "", originalName: "slice-01.dcm" }],
      title: "Chest CT",
      documentType: "x_ray",
      documentDate: "2026-09-11",
      tags: ["series:11111111-2222-3333-4444-555555555555"],
    });

    expect(created.mimeType).toBe("application/dicom");
    expect(created.filePath.endsWith(".dcm")).toBe(true);

    const basename = created.filePath.split("/").pop()!;
    const owned = await files.openOwnedFile("owner-1", basename);
    expect(owned).toEqual({
      bytes: Buffer.from("DICM"),
      mimeType: "application/dicom",
      fileName: "slice-01.dcm",
    });
    expect(await files.openOwnedFile("intruder-2", basename)).toBeNull();
  });

  it("stores an extensionless Part-10 slice as application/dicom with a .dcm key", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom({ rows: 8, columns: 8 });

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      files: [
        { bytes, mimeType: "application/octet-stream", originalName: "CT000001" },
      ],
      title: "Chest CT",
      documentType: "x_ray",
      documentDate: "2026-09-12",
      tags: [],
    });

    expect(created.mimeType).toBe("application/dicom");
    expect(created.fileName).toBe("CT000001");
    expect(created.filePath.endsWith(".dcm")).toBe(true);

    const stored = await objects.get(asObjectKey(created.filePath));
    expect(stored?.contentType).toBe("application/dicom");

    const basename = created.filePath.split("/").pop()!;
    const owned = await files.openOwnedFile("owner-1", basename);
    expect(owned).toEqual({
      bytes,
      mimeType: "application/dicom",
      fileName: "CT000001",
    });
  });

  it("rejects an extensionless octet-stream that is not Part-10", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    await expect(
      files.uploadOwnedDocument({
        userId: "owner-1",
        files: [
          {
            bytes: Buffer.alloc(200),
            mimeType: "application/octet-stream",
            originalName: "CT000001",
          },
        ],
        title: "Not DICOM",
        documentType: "other",
        documentDate: "2026-09-12",
        tags: [],
      }),
    ).rejects.toThrow("Invalid file type");
  });
});

describe("createDocumentFiles series", () => {
  function slices(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      bytes: buildMiniCtDicom({ instanceNumber: index + 1 }),
      mimeType: "",
      originalName: `CT${String(index + 1).padStart(6, "0")}`,
    }));
  }

  const meta = {
    userId: "owner-1",
    title: "Coronary CTA",
    documentType: "x_ray",
    documentDate: "2026-09-11",
    tags: ["CT"],
  };

  it("stores a multi-file upload as one record with ordered files", async () => {
    const objects = new MemoryObjectStore();
    const { records, documents } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({ ...meta, files: slices(3) });

    expect(documents).toHaveLength(1);
    expect(created.fileCount).toBe(3);
    expect(created.mimeType).toBe("application/dicom");
    expect(created.fileName).toBe("CT000001");
    const total = slices(3).reduce((sum, f) => sum + f.bytes.length, 0);
    expect(created.fileSize).toBe(String(total));

    const listed = await files.listOwnedFiles("owner-1", created.id);
    expect(listed?.map((row) => [row.position, row.fileName])).toEqual([
      [0, "CT000001"],
      [1, "CT000002"],
      [2, "CT000003"],
    ]);
    expect(listed?.[0].filePath).toBe(created.filePath);
    expect(await files.listOwnedFiles("intruder-2", created.id)).toBeNull();
  });

  it("opens a file by position only for the owner", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const input = slices(2);
    const created = await files.uploadOwnedDocument({ ...meta, files: input });

    const second = await files.openOwnedFileAt("owner-1", created.id, 1);
    expect(second?.fileName).toBe("CT000002");
    expect(second?.bytes.equals(input[1].bytes)).toBe(true);
    expect(second?.mimeType).toBe("application/dicom");
    expect(await files.openOwnedFileAt("owner-1", created.id, 2)).toBeNull();
    expect(await files.openOwnedFileAt("intruder-2", created.id, 0)).toBeNull();
  });

  it("appends files after the existing ones and updates the totals", async () => {
    const objects = new MemoryObjectStore();
    const { records, documents } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({ ...meta, files: slices(2) });

    const result = await files.appendOwnedFiles("owner-1", created.id, slices(3).slice(2));
    expect(result).toEqual({ kind: "appended", fileCount: 3 });

    const listed = await files.listOwnedFiles("owner-1", created.id);
    expect(listed?.map((row) => row.position)).toEqual([0, 1, 2]);
    const total = slices(3).reduce((sum, f) => sum + f.bytes.length, 0);
    expect(documents[0].fileCount).toBe(3);
    expect(documents[0].fileSize).toBe(String(total));
  });

  it("refuses to append to another user's document or to a non-DICOM record", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const series = await files.uploadOwnedDocument({ ...meta, files: slices(1) });
    const pdf = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "a.pdf" }],
    });

    expect(await files.appendOwnedFiles("intruder-2", series.id, slices(1))).toEqual({
      kind: "not_found",
    });
    expect(await files.appendOwnedFiles("owner-1", pdf.id, slices(1))).toEqual({
      kind: "rejected",
      message: "Only DICOM series accept more files.",
    });
    expect(
      await files.appendOwnedFiles("owner-1", series.id, [
        { bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "a.pdf" },
      ]),
    ).toEqual({ kind: "rejected", message: "All files in a series must be DICOM." });
  });

  it("rejects a multi-file upload that mixes DICOM with other kinds", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    await expect(
      files.uploadOwnedDocument({
        ...meta,
        files: [
          ...slices(1),
          { bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "a.pdf" },
        ],
      }),
    ).rejects.toThrow("All files in a series must be DICOM.");
  });

  it("removes every stored object when a series is deleted", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({ ...meta, files: slices(3) });
    const keys = (await files.listOwnedFiles("owner-1", created.id))!.map((row) => row.filePath);

    expect(await files.removeOwnedDocument("owner-1", created.id)).toBe("deleted");
    for (const key of keys) {
      expect(await objects.get(asObjectKey(key))).toBeNull();
    }
  });

  it("stores dicomMeta read from the first slice", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({ ...meta, files: slices(3) });

    expect(created.dicomMeta).toMatchObject({
      modality: "CT",
      studyInstanceUid: "1.2.826.0.1.3680043.8.498.study.1",
      seriesInstanceUid: "1.2.826.0.1.3680043.8.498.series.1",
    });
  });

  it("does not change dicomMeta when more slices are appended", async () => {
    const objects = new MemoryObjectStore();
    const { records, documents } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({ ...meta, files: slices(1) });

    await files.appendOwnedFiles("owner-1", created.id, slices(3).slice(1));

    expect(documents[0].dicomMeta).toEqual(created.dicomMeta);
  });

  it("stores per-file position metadata read from each slice", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const input = [
      {
        bytes: buildMiniCtDicom({ instanceNumber: 1, imagePositionPatient: [0, 0, 30] }),
        mimeType: "",
        originalName: "CT000001",
      },
      {
        bytes: buildMiniCtDicom({ instanceNumber: 2, imagePositionPatient: [0, 0, 20] }),
        mimeType: "",
        originalName: "CT000002",
      },
    ];

    const created = await files.uploadOwnedDocument({ ...meta, files: input });
    const listed = await files.listOwnedFiles("owner-1", created.id);

    expect(listed?.map((row) => [row.instanceNumber, row.sliceLocation])).toEqual([
      [1, 30],
      [2, 20],
    ]);
  });

  it("stores per-file position metadata for slices appended later", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [
        {
          bytes: buildMiniCtDicom({ instanceNumber: 1, imagePositionPatient: [0, 0, 30] }),
          mimeType: "",
          originalName: "CT000001",
        },
      ],
    });

    await files.appendOwnedFiles("owner-1", created.id, [
      {
        bytes: buildMiniCtDicom({ instanceNumber: 2, imagePositionPatient: [0, 0, 20] }),
        mimeType: "",
        originalName: "CT000002",
      },
    ]);

    const listed = await files.listOwnedFiles("owner-1", created.id);
    expect(listed?.map((row) => row.sliceLocation)).toEqual([30, 20]);
  });

  it("stores null position metadata for a non-DICOM upload", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "a.pdf" }],
    });
    const listed = await files.listOwnedFiles("owner-1", created.id);

    expect(listed?.[0]).toMatchObject({
      instanceNumber: null,
      sliceLocation: null,
      phase: null,
    });
  });

  it("stores a null dicomMeta for a non-DICOM upload", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });

    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "a.pdf" }],
    });

    expect(created.dicomMeta).toBeNull();
  });
});

describe("createDocumentFiles with a disk-backed (streamed) upload", () => {
  // Simulates what multer.diskStorage hands the route handler for a large
  // angiography cine run (plan 07): a temp file path and its size, never a
  // Buffer of the whole thing.
  function tempDicomFile(bytes: Buffer): { path: string; size: number } {
    const filePath = path.join(os.tmpdir(), `mv-test-${Math.random().toString(36).slice(2)}.dcm`);
    fs.writeFileSync(filePath, bytes);
    return { path: filePath, size: bytes.length };
  }

  it("classifies, stores, and reads back a disk-backed DICOM file, then deletes the temp file", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom({ instanceNumber: 1 });
    const temp = tempDicomFile(bytes);

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      title: "Streamed series",
      documentType: "x_ray",
      documentDate: "2026-09-11",
      tags: [],
      files: [{ ...temp, mimeType: "", originalName: "XA000001" }],
    });

    expect(created.mimeType).toBe("application/dicom");
    expect(created.fileSize).toBe(String(bytes.length));
    expect(fs.existsSync(temp.path)).toBe(false);

    const owned = await files.openOwnedFileAt("owner-1", created.id, 0);
    expect(owned?.bytes.equals(bytes)).toBe(true);
  });

  it("reads a frame index from a disk-backed multi-frame file without ever buffering it whole", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const pixels8 = Uint8Array.from({ length: 32 }, (_, i) => i);
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8,
    });
    const temp = tempDicomFile(bytes);

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      title: "Angiography run",
      documentType: "x_ray",
      documentDate: "2026-09-11",
      tags: [],
      files: [{ ...temp, mimeType: "", originalName: "XA000001" }],
    });

    const frame0 = await files.openOwnedFrame("owner-1", created.id, 0, 0);
    expect(frame0?.bytes.equals(Buffer.from(pixels8.subarray(0, 16)))).toBe(true);
  });

  it("still finds the frame index when a large private element pushes pixel data past the 1 MB head read", async () => {
    // A wide enough filler element before the pixel data pushes it well
    // past HEAD_BYTES (1 MB) — readFileMeta on just the capped head would
    // miss it entirely (see widenHeadIfNeeded in server/document-files.ts).
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const pixels8 = Uint8Array.from({ length: 32 }, (_, i) => i);
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8,
      fillerBytes: 2 * 1024 * 1024,
    });
    const temp = tempDicomFile(bytes);

    const created = await files.uploadOwnedDocument({
      userId: "owner-1",
      title: "Angiography run",
      documentType: "x_ray",
      documentDate: "2026-09-11",
      tags: [],
      files: [{ ...temp, mimeType: "", originalName: "XA000001" }],
    });

    const listed = await files.listOwnedFiles("owner-1", created.id);
    expect(listed?.[0].frameIndex).not.toBeNull();
    expect(listed?.[0].sopInstanceUid).not.toBeNull();

    const frame1 = await files.openOwnedFrame("owner-1", created.id, 0, 1);
    expect(frame1?.bytes.equals(Buffer.from(pixels8.subarray(16, 32)))).toBe(true);
  });

  it("deletes the temp file even when the upload is rejected (oversize)", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom();
    const temp = tempDicomFile(bytes);

    // classifyFiles throws before putAll ever runs for this file, so the
    // caller (server/routes.ts's cleanupUploadedFiles) is what removes the
    // temp file in production; here we only assert classification itself
    // rejects the oversize claim without reading the whole path into memory.
    await expect(
      files.uploadOwnedDocument({
        userId: "owner-1",
        title: "Too big",
        documentType: "x_ray",
        documentDate: "2026-09-11",
        tags: [],
        files: [{ path: temp.path, size: 300 * 1024 * 1024, mimeType: "", originalName: "XA000001" }],
      }),
    ).rejects.toThrow("File too large");

    fs.unlinkSync(temp.path);
  });
});

describe("openOwnedFrame", () => {
  const meta = {
    userId: "owner-1",
    title: "Angiography run",
    documentType: "x_ray",
    documentDate: "2026-09-11",
    tags: ["XA"],
  };

  function twoFramePixels() {
    // 2 frames of 4x4 8-bit MONOCHROME2: frame 0 is 0..15, frame 1 is 100..115.
    return Uint8Array.from([
      ...Array.from({ length: 16 }, (_, i) => i),
      ...Array.from({ length: 16 }, (_, i) => 100 + i),
    ]);
  }

  it("returns the right 16 bytes for frame 1 of the fixture", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const pixels8 = twoFramePixels();
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8,
      windowCenter: 128,
      windowWidth: 256,
    });

    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes, mimeType: "", originalName: "XA000001" }],
    });

    const frame1 = await files.openOwnedFrame("owner-1", created.id, 0, 1);
    expect(frame1?.bytes.equals(Buffer.from(pixels8.subarray(16, 32)))).toBe(true);
    expect(frame1).toMatchObject({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      photometric: "MONOCHROME2",
      windowCenter: 128,
      windowWidth: 256,
    });
  });

  it("reports a later file's own rows/columns, not the document's (first-file) dicomMeta", async () => {
    // Append is a supported flow (POST /api/documents/:id/files) and a
    // record's dicomMeta is read from its first file only and never
    // updated (shared/dicom-meta.ts) — so a follow-up XA run with a
    // different image size must still report its own dimensions.
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const first = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8: twoFramePixels(),
    });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: first, mimeType: "", originalName: "XA000001" }],
    });

    const secondPixels = Uint8Array.from([
      ...Array.from({ length: 4 }, (_, i) => i),
      ...Array.from({ length: 4 }, (_, i) => 50 + i),
    ]);
    const second = buildMiniCtDicom({
      rows: 2,
      columns: 2,
      bitsAllocated: 8,
      frames: 2,
      pixels8: secondPixels,
    });
    await files.appendOwnedFiles("owner-1", created.id, [
      { bytes: second, mimeType: "", originalName: "XA000002" },
    ]);

    const appendedFrame0 = await files.openOwnedFrame("owner-1", created.id, 1, 0);
    expect(appendedFrame0).toMatchObject({ rows: 2, columns: 2 });
    expect(appendedFrame0?.bytes.equals(Buffer.from(secondPixels.subarray(0, 4)))).toBe(true);

    // The original file's frames are unaffected.
    const originalFrame0 = await files.openOwnedFrame("owner-1", created.id, 0, 0);
    expect(originalFrame0).toMatchObject({ rows: 4, columns: 4 });
  });

  it("reports a later file's own photometric interpretation, not the document's (first-file) dicomMeta", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const first = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      photometric: "MONOCHROME2",
      pixels8: twoFramePixels(),
    });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: first, mimeType: "", originalName: "XA000001" }],
    });

    const second = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      photometric: "MONOCHROME1",
      pixels8: twoFramePixels(),
    });
    await files.appendOwnedFiles("owner-1", created.id, [
      { bytes: second, mimeType: "", originalName: "XA000002" },
    ]);

    const appendedFrame0 = await files.openOwnedFrame("owner-1", created.id, 1, 0);
    expect(appendedFrame0).toMatchObject({ photometric: "MONOCHROME1" });

    // The original file's photometric is unaffected.
    const originalFrame0 = await files.openOwnedFrame("owner-1", created.id, 0, 0);
    expect(originalFrame0).toMatchObject({ photometric: "MONOCHROME2" });
  });

  it("returns null (404-equivalent) for a frame past the end of the fixture", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8: twoFramePixels(),
    });

    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes, mimeType: "", originalName: "XA000001" }],
    });

    expect(await files.openOwnedFrame("owner-1", created.id, 0, 2)).toBeNull();
  });

  it("returns null for a still (single-frame) file, which has no frame index", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: buildMiniCtDicom(), mimeType: "", originalName: "CT000001" }],
    });

    expect(await files.openOwnedFrame("owner-1", created.id, 0, 0)).toBeNull();
  });

  it("returns null for another user's document", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      frames: 2,
      pixels8: twoFramePixels(),
    });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes, mimeType: "", originalName: "XA000001" }],
    });

    expect(await files.openOwnedFrame("intruder-2", created.id, 0, 0)).toBeNull();
  });
});

describe("openOwnedFrameRange", () => {
  // Plan 12: a batch of frames read in one range request, so the client's
  // whole-run preload doesn't pay one HTTP round trip per frame.
  const meta = {
    userId: "owner-1",
    title: "Angiography run",
    documentType: "x_ray",
    documentDate: "2026-09-11",
    tags: ["XA"],
  };

  /** 10 frames of 2x2 8-bit MONOCHROME2: frame i is filled with value i*10. */
  function tenFramePixels(): Uint8Array {
    const perFrame = 4;
    const pixels = new Uint8Array(perFrame * 10);
    for (let frame = 0; frame < 10; frame++) {
      pixels.fill(frame * 10, frame * perFrame, (frame + 1) * perFrame);
    }
    return pixels;
  }

  async function tenFrameFixture() {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const bytes = buildMiniCtDicom({
      rows: 2,
      columns: 2,
      bitsAllocated: 8,
      frames: 10,
      pixels8: tenFramePixels(),
      windowCenter: 128,
      windowWidth: 256,
    });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes, mimeType: "", originalName: "XA000001" }],
    });
    return { files, created };
  }

  it("returns the concatenated bytes for an inclusive frame range", async () => {
    const { files, created } = await tenFrameFixture();

    const range = await files.openOwnedFrameRange("owner-1", created.id, 0, 2, 4);
    expect(range).toMatchObject({
      rows: 2,
      columns: 2,
      bitsAllocated: 8,
      photometric: "MONOCHROME2",
      windowCenter: 128,
      windowWidth: 256,
      from: 2,
      to: 4,
    });
    // 3 frames of 4 bytes: 20,20,20,20, 30,30,30,30, 40,40,40,40.
    expect(Array.from(range!.bytes)).toEqual([
      20, 20, 20, 20, 30, 30, 30, 30, 40, 40, 40, 40,
    ]);
  });

  it("returns a single frame when from equals to", async () => {
    const { files, created } = await tenFrameFixture();

    const range = await files.openOwnedFrameRange("owner-1", created.id, 0, 0, 0);
    expect(Array.from(range!.bytes)).toEqual([0, 0, 0, 0]);
  });

  it("rejects a range wider than 8 frames", async () => {
    const { files, created } = await tenFrameFixture();

    expect(await files.openOwnedFrameRange("owner-1", created.id, 0, 0, 8)).toBeNull();
  });

  it("accepts a range of exactly 8 frames", async () => {
    const { files, created } = await tenFrameFixture();

    const range = await files.openOwnedFrameRange("owner-1", created.id, 0, 0, 7);
    expect(range?.bytes.length).toBe(8 * 4);
  });

  it("rejects to < from", async () => {
    const { files, created } = await tenFrameFixture();

    expect(await files.openOwnedFrameRange("owner-1", created.id, 0, 3, 2)).toBeNull();
  });

  it("rejects a range past the end of the run", async () => {
    const { files, created } = await tenFrameFixture();

    expect(await files.openOwnedFrameRange("owner-1", created.id, 0, 8, 10)).toBeNull();
  });

  it("rejects a negative start", async () => {
    const { files, created } = await tenFrameFixture();

    expect(await files.openOwnedFrameRange("owner-1", created.id, 0, -1, 2)).toBeNull();
  });

  it("returns null for a still (single-frame) file, which has no frame index", async () => {
    const objects = new MemoryObjectStore();
    const { records } = memoryRecords();
    const files = createDocumentFiles({ objects, documents: records });
    const created = await files.uploadOwnedDocument({
      ...meta,
      files: [{ bytes: buildMiniCtDicom(), mimeType: "", originalName: "CT000001" }],
    });

    expect(await files.openOwnedFrameRange("owner-1", created.id, 0, 0, 0)).toBeNull();
  });

  it("returns null for another user's document", async () => {
    const { files, created } = await tenFrameFixture();

    expect(await files.openOwnedFrameRange("intruder-2", created.id, 0, 0, 2)).toBeNull();
  });
});
