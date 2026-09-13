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
          instanceNumber: input.instanceNumber ?? null,
          sliceLocation: input.sliceLocation ?? null,
          phase: input.phase ?? null,
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
