import { describe, expect, it } from "vitest";
import {
  createDocumentFiles,
  objectKeyFor,
  parseObjectBasename,
} from "./document-files";
import { MemoryObjectStore, asObjectKey } from "./object-store";
import type { InsertMedicalDocument, MedicalDocument } from "@shared/schema";

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
    createdAt: new Date("2026-09-11T00:00:00.000Z"),
    updatedAt: new Date("2026-09-11T00:00:00.000Z"),
    ...overrides,
  };
}

function memoryRecords(rows: MedicalDocument[] = []) {
  const documents = [...rows];
  let nextId = documents.reduce((max, row) => Math.max(max, row.id), 0) + 1;

  return {
    documents,
    records: {
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
      bytes: Buffer.from("%PDF-1"),
      mimeType: "application/pdf",
      originalName: "labs.pdf",
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
      bytes: Buffer.from("%PDF-2"),
      mimeType: "application/pdf",
      originalName: "labs.pdf",
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
      bytes: Buffer.from("DICM"),
      mimeType: "",
      originalName: "slice-01.dcm",
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
});
