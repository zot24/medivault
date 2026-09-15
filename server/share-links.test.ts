import { describe, expect, it } from "vitest";
import { createDocumentFiles } from "./document-files";
import { buildMiniCtDicom } from "@shared/mini-ct-dicom";
import { MemoryObjectStore } from "./object-store";
import type {
  DocumentFile,
  InsertDocumentFile,
  InsertMedicalDocument,
  MedicalDocument,
  Symptom,
} from "@shared/schema";
import {
  createShareLinks,
  parseRawToken,
  type FrozenSymptom,
  type ShareLinkRecords,
  type TokenHash,
} from "./share-links";

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

function memoryDocuments(rows: MedicalDocument[] = []) {
  const documents = [...rows];
  const files: DocumentFile[] = [];
  let nextFileId = 1;
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
          fileCount: input.fileCount ?? 1,
          dicomMeta: input.dicomMeta ?? null,
        });
        documents.push(row);
        return row;
      },
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
          imageType: input.imageType ?? null,
          positionerPrimaryAngle: input.positionerPrimaryAngle ?? null,
          positionerSecondaryAngle: input.positionerSecondaryAngle ?? null,
          usRegionDataTypes: input.usRegionDataTypes ?? null,
          numberOfFrames: input.numberOfFrames ?? null,
          frameRate: input.frameRate ?? null,
          createdAt: null,
        })) as DocumentFile[];
        files.push(...created);
        return created;
      },
      async listFiles(documentId: number): Promise<DocumentFile[]> {
        return files.filter((row) => row.documentId === documentId).sort((a, b) => a.position - b.position);
      },
      async updateTotals(): Promise<void> {},
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

function packetIdsOf(row: {
  documentId: number;
  documentIds: number[];
}): number[] {
  return row.documentIds.length > 0 ? row.documentIds : [row.documentId];
}

function memoryShareRecords() {
  const rows: Array<{
    id: number;
    tokenHash: TokenHash;
    documentId: number;
    documentIds: number[];
    createdBy: string;
    expiresAt: Date;
    revokedAt: Date | null;
    label: string | null;
    symptomSnapshot: FrozenSymptom[] | null;
    createdAt: Date;
  }> = [];
  let nextId = 1;

  const records: ShareLinkRecords = {
    async insert(row) {
      const created = {
        id: nextId++,
        createdAt: new Date("2026-09-11T00:00:00.000Z"),
        documentIds: row.documentIds,
        symptomSnapshot: row.symptomSnapshot,
        ...row,
      };
      rows.push(created);
      return created;
    },
    async listByDocument(createdBy, documentId) {
      return rows.filter(
        (row) =>
          row.createdBy === createdBy &&
          packetIdsOf(row).includes(documentId),
      );
    },
    async listByOwner(createdBy) {
      return rows.filter((row) => row.createdBy === createdBy);
    },
    async findByTokenHash(tokenHash) {
      return rows.find((row) => row.tokenHash === tokenHash);
    },
    async revoke(input) {
      const row = rows.find(
        (candidate) =>
          candidate.id === input.shareId &&
          candidate.createdBy === input.createdBy &&
          packetIdsOf(candidate).includes(input.documentId),
      );
      if (!row) {
        return "not_found";
      }
      if (row.revokedAt == null) {
        row.revokedAt = new Date();
      }
      return "revoked";
    },
    async revokeById(input) {
      const row = rows.find(
        (candidate) =>
          candidate.id === input.shareId &&
          candidate.createdBy === input.createdBy,
      );
      if (!row) {
        return "not_found";
      }
      if (row.revokedAt == null) {
        row.revokedAt = new Date();
      }
      return "revoked";
    },
  };

  return { rows, records };
}

function fakeSymptom(overrides: Partial<Symptom> & Pick<Symptom, "id" | "userId">): Symptom {
  return {
    symptomName: "Headache",
    severity: 6,
    description: null,
    location: "temple",
    duration: "hours",
    triggers: ["screen"],
    medications: ["ibuprofen"],
    notes: null,
    dateRecorded: "2026-09-10",
    timeOfDay: "evening",
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    ...overrides,
  };
}

function memorySymptoms(rows: Symptom[] = []) {
  return {
    rows,
    records: {
      async getMany(userId: string, ids: number[]) {
        return rows.filter(
          (row) => row.userId === userId && ids.includes(row.id),
        );
      },
    },
  };
}

async function uploadLabs(
  files: ReturnType<typeof createDocumentFiles>,
  userId = "owner-1",
) {
  return files.uploadOwnedDocument({
    userId,
    files: [
      { bytes: Buffer.from("%PDF-1"), mimeType: "application/pdf", originalName: "labs.pdf" },
    ],
    title: "Lab Results",
    documentType: "lab_result",
    documentDate: "2026-09-11",
    tags: [],
  });
}

async function uploadNamed(
  files: ReturnType<typeof createDocumentFiles>,
  input: {
    userId?: string;
    bytes: Buffer;
    originalName: string;
    title: string;
    mimeType?: string;
  },
) {
  return files.uploadOwnedDocument({
    userId: input.userId ?? "owner-1",
    files: [
      {
        bytes: input.bytes,
        mimeType: input.mimeType ?? "application/pdf",
        originalName: input.originalName,
      },
    ],
    title: input.title,
    documentType: "lab_result",
    documentDate: "2026-09-11",
    tags: [],
  });
}

function setup(now?: () => Date, symptoms: Symptom[] = []) {
  const objects = new MemoryObjectStore();
  const { records: documents } = memoryDocuments();
  const { rows, records: shares } = memoryShareRecords();
  const { records: symptomRecords } = memorySymptoms(symptoms);
  const files = createDocumentFiles({ objects, documents });
  const shareLinks = createShareLinks({
    objects,
    documents,
    documentFiles: files,
    shares,
    symptoms: symptomRecords,
    now,
  });
  return { files, shareLinks, shareRows: rows, shareRecords: shares };
}

describe("parseRawToken", () => {
  it("rejects junk", () => {
    expect(parseRawToken("not-a-token")).toBeNull();
  });
});

describe("createShareLinks", () => {
  it("returns the uploaded bytes and mime through a minted token", async () => {
    const { files, shareLinks } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "24h",
      label: "Dr. Chen Friday",
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }
    expect(minted.share.path).toBe(`/s/${minted.share.token}`);
    expect(parseRawToken(minted.share.token)).toBe(minted.share.token);

    const opened = await shareLinks.openByToken(minted.share.token);
    expect(opened).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("%PDF-1"),
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      },
    });
  });

  it("returns not_owner and inserts nothing when a second user mints", async () => {
    const { files, shareLinks, shareRows } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "intruder-2",
      documentId: created.id,
      ttl: "24h",
      label: null,
    });

    expect(minted).toEqual({ kind: "not_owner" });
    expect(shareRows).toEqual([]);
  });

  it("stores a token hash that is not the raw token", async () => {
    const { files, shareLinks, shareRows, shareRecords } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "1h",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    expect(shareRows).toHaveLength(1);
    expect(shareRows[0].tokenHash).not.toBe(minted.share.token);
    expect(
      await shareRecords.findByTokenHash(
        minted.share.token as unknown as TokenHash,
      ),
    ).toBeUndefined();
  });

  it("opens as dead after now passes expiresAt", async () => {
    let now = new Date("2026-09-11T00:00:00.000Z");
    const { files, shareLinks } = setup(() => now);
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "1h",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    now = new Date("2026-09-11T01:00:00.000Z");
    expect(await shareLinks.openByToken(minted.share.token)).toEqual({
      kind: "dead",
    });
  });

  it("opens as dead after revoke", async () => {
    const { files, shareLinks } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "7d",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    expect(
      await shareLinks.revoke({
        userId: "owner-1",
        documentId: created.id,
        shareId: minted.share.id,
      }),
    ).toBe("revoked");
    expect(await shareLinks.openByToken(minted.share.token)).toEqual({
      kind: "dead",
    });
  });

  it("opens a well-formed unused token as unknown", async () => {
    const { shareLinks } = setup();
    const unused = parseRawToken(`mv1_${"A".repeat(43)}`);
    expect(unused).not.toBeNull();
    if (!unused) {
      return;
    }
    expect(await shareLinks.openByToken(unused)).toEqual({ kind: "unknown" });
  });

  it("returns revoked both times when revoke is called twice", async () => {
    const { files, shareLinks } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "24h",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    const first = await shareLinks.revoke({
      userId: "owner-1",
      documentId: created.id,
      shareId: minted.share.id,
    });
    const second = await shareLinks.revoke({
      userId: "owner-1",
      documentId: created.id,
      shareId: minted.share.id,
    });
    expect(first).toBe("revoked");
    expect(second).toBe("revoked");
  });

  it("mints two working tokens for one document", async () => {
    const { files, shareLinks, shareRows } = setup();
    const created = await uploadLabs(files);

    const first = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "24h",
      label: "one",
    });
    const second = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "24h",
      label: "two",
    });
    expect(first.kind).toBe("minted");
    expect(second.kind).toBe("minted");
    if (first.kind !== "minted" || second.kind !== "minted") {
      return;
    }

    expect(shareRows).toHaveLength(2);
    expect(first.share.token).not.toBe(second.share.token);
    expect(await shareLinks.openByToken(first.share.token)).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("%PDF-1"),
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      },
    });
    expect(await shareLinks.openByToken(second.share.token)).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("%PDF-1"),
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      },
    });
  });

  it("lists rows without a token field", async () => {
    const { files, shareLinks } = setup();
    const created = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentId: created.id,
      ttl: "24h",
      label: "Dr. Chen Friday",
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    const listed = await shareLinks.list({
      userId: "owner-1",
      documentId: created.id,
    });
    expect(listed).not.toBe("not_owner");
    if (listed === "not_owner") {
      return;
    }
    expect(listed).toEqual([
      {
        id: minted.share.id,
        documentId: created.id,
        documentIds: [created.id],
        label: "Dr. Chen Friday",
        createdAt: minted.share.createdAt,
        expiresAt: minted.share.expiresAt,
        symptomSnapshot: null,
        life: "live",
      },
    ]);
    expect("token" in listed[0]).toBe(false);
  });

  it("mints a packet of two owned documents and opens each file", async () => {
    const { files, shareLinks } = setup();
    const labs = await uploadLabs(files);
    const scan = await uploadNamed(files, {
      bytes: Buffer.from("scan-bytes"),
      originalName: "scan.png",
      title: "Chest X-Ray",
      mimeType: "image/png",
    });

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id, scan.id],
      ttl: "24h",
      label: "Friday visit",
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }
    expect(minted.share.documentIds).toEqual([labs.id, scan.id]);
    expect(minted.share.documentId).toBe(labs.id);

    expect(await shareLinks.openPacket(minted.share.token)).toMatchObject({
      kind: "packet",
      packet: {
        label: "Friday visit",
        expiresAt: minted.share.expiresAt,
        snapshot: null,
        files: [
          {
            id: labs.id,
            title: "Lab Results",
            fileName: "labs.pdf",
            mimeType: "application/pdf",
          },
          {
            id: scan.id,
            title: "Chest X-Ray",
            fileName: "scan.png",
            mimeType: "image/png",
          },
        ],
      },
    });

    expect(await shareLinks.openFile(minted.share.token, labs.id)).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("%PDF-1"),
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      },
    });
    expect(await shareLinks.openFile(minted.share.token, scan.id)).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("scan-bytes"),
        mimeType: "image/png",
        fileName: "scan.png",
      },
    });
    expect(await shareLinks.openByToken(minted.share.token)).toEqual({
      kind: "file",
      file: {
        bytes: Buffer.from("%PDF-1"),
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      },
    });
  });

  it("returns not_owner and inserts nothing when a packet includes a foreign document", async () => {
    const { files, shareLinks, shareRows } = setup();
    const owned = await uploadLabs(files);
    const foreign = await uploadNamed(files, {
      userId: "other-9",
      bytes: Buffer.from("nope"),
      originalName: "secret.pdf",
      title: "Not yours",
    });

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [owned.id, foreign.id],
      ttl: "24h",
      label: null,
    });

    expect(minted).toEqual({ kind: "not_owner" });
    expect(shareRows).toEqual([]);
  });

  it("opens a packet as dead after expiry", async () => {
    let now = new Date("2026-09-11T00:00:00.000Z");
    const { files, shareLinks } = setup(() => now);
    const labs = await uploadLabs(files);
    const scan = await uploadNamed(files, {
      bytes: Buffer.from("scan-bytes"),
      originalName: "scan.png",
      title: "Chest X-Ray",
      mimeType: "image/png",
    });

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id, scan.id],
      ttl: "1h",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    now = new Date("2026-09-11T01:00:00.000Z");
    expect(await shareLinks.openPacket(minted.share.token)).toEqual({
      kind: "dead",
    });
    expect(await shareLinks.openFile(minted.share.token, labs.id)).toEqual({
      kind: "dead",
    });
  });

  it("opens a packet as dead after revoke", async () => {
    const { files, shareLinks } = setup();
    const labs = await uploadLabs(files);
    const scan = await uploadNamed(files, {
      bytes: Buffer.from("scan-bytes"),
      originalName: "scan.png",
      title: "Chest X-Ray",
      mimeType: "image/png",
    });

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id, scan.id],
      ttl: "7d",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    expect(
      await shareLinks.revoke({
        userId: "owner-1",
        documentId: scan.id,
        shareId: minted.share.id,
      }),
    ).toBe("revoked");
    expect(await shareLinks.openPacket(minted.share.token)).toEqual({
      kind: "dead",
    });
  });

  it("opens a file id that is not in the packet as unknown", async () => {
    const { files, shareLinks } = setup();
    const labs = await uploadLabs(files);
    const scan = await uploadNamed(files, {
      bytes: Buffer.from("scan-bytes"),
      originalName: "scan.png",
      title: "Chest X-Ray",
      mimeType: "image/png",
    });

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id],
      ttl: "24h",
      label: null,
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    expect(await shareLinks.openFile(minted.share.token, scan.id)).toEqual({
      kind: "unknown",
    });
  });

  it("freezes selected symptoms at mint and ignores later edits", async () => {
    const headache = fakeSymptom({ id: 3, userId: "owner-1", severity: 4 });
    const { files, shareLinks } = setup(undefined, [headache]);
    const labs = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id],
      ttl: "24h",
      label: null,
      symptomIds: [3],
    });
    expect(minted.kind).toBe("minted");
    if (minted.kind !== "minted") {
      return;
    }

    headache.severity = 9;
    headache.symptomName = "Migraine";

    const opened = await shareLinks.openPacket(minted.share.token);
    expect(opened.kind).toBe("packet");
    if (opened.kind !== "packet") {
      return;
    }
    expect(opened.packet.snapshot).toEqual([
      {
        id: 3,
        symptomName: "Headache",
        severity: 4,
        description: null,
        location: "temple",
        duration: "hours",
        triggers: ["screen"],
        medications: ["ibuprofen"],
        notes: null,
        dateRecorded: "2026-09-10",
        timeOfDay: "evening",
      },
    ]);
  });

  it("returns not_owner when a symptom id is not owned", async () => {
    const { files, shareLinks, shareRows } = setup(undefined, [
      fakeSymptom({ id: 8, userId: "other-9" }),
    ]);
    const labs = await uploadLabs(files);

    const minted = await shareLinks.mint({
      userId: "owner-1",
      documentIds: [labs.id],
      ttl: "24h",
      label: null,
      symptomIds: [8],
    });

    expect(minted).toEqual({ kind: "not_owner" });
    expect(shareRows).toEqual([]);
  });
});

describe("share portal (studies and series files)", () => {
  function slices(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      bytes: buildMiniCtDicom({
        instanceNumber: index + 1,
        studyInstanceUid: "1.2.3.study",
        seriesInstanceUid: "1.2.3.series",
        modality: "CT",
        seriesDescription: "Axial 0.6",
        sliceThickness: 0.6,
      }),
      mimeType: "",
      originalName: `CT${String(index + 1).padStart(6, "0")}`,
    }));
  }

  async function uploadSeries(files: ReturnType<typeof createDocumentFiles>) {
    return files.uploadOwnedDocument({
      userId: "owner-1",
      files: slices(3),
      title: "Axial CT",
      documentType: "x_ray",
      documentDate: "2026-09-11",
      tags: [],
    });
  }

  it("describes shared series as public documents grouped into studies, without owner-only fields", async () => {
    const { files, shareLinks } = setup();
    const series = await uploadSeries(files);
    const labs = await uploadLabs(files);
    const minted = await shareLinks.mint({ userId: "owner-1", documentIds: [series.id, labs.id], ttl: "24h" });
    if (minted.kind !== "minted") throw new Error("mint failed");

    const opened = await shareLinks.openPacket(minted.share.token);
    if (opened.kind !== "packet") throw new Error("packet expected");
    const shared = opened.packet.documents.find((d) => d.id === series.id)!;
    expect(shared).toMatchObject({ title: "Axial CT", fileCount: 3, mimeType: "application/dicom" });
    expect(shared.dicomMeta?.modality).toBe("CT");
    expect(Object.keys(shared)).not.toContain("userId");
    expect(Object.keys(shared)).not.toContain("filePath");
    expect(opened.packet.studies).toHaveLength(1);
    expect(opened.packet.studies[0].studyInstanceUid).toBe("1.2.3.study");
    expect(opened.packet.studies[0].primary?.id).toBe(series.id);
    // ordinary documents are still listed
    expect(opened.packet.documents.map((d) => d.id).sort()).toEqual([series.id, labs.id].sort());
  });

  it("lists and serves a shared series' files by position through the token only", async () => {
    const { files, shareLinks } = setup();
    const series = await uploadSeries(files);
    const other = await uploadSeries(files);
    const minted = await shareLinks.mint({ userId: "owner-1", documentIds: [series.id], ttl: "24h" });
    if (minted.kind !== "minted") throw new Error("mint failed");
    const token = minted.share.token;

    const listed = await shareLinks.openDocumentFiles(token, series.id);
    expect(listed.kind).toBe("files");
    if (listed.kind !== "files") return;
    expect(listed.files.map((f) => f.position)).toEqual([0, 1, 2]);

    const second = await shareLinks.openDocumentFileAt(token, series.id, 1);
    expect(second.kind).toBe("file");
    if (second.kind !== "file") return;
    expect(second.file.mimeType).toBe("application/dicom");
    expect(second.file.bytes.equals(slices(3)[1].bytes)).toBe(true);

    // a document the share does not include is unknown, even though the owner has it
    expect((await shareLinks.openDocumentFiles(token, other.id)).kind).toBe("unknown");
    expect((await shareLinks.openDocumentFileAt(token, other.id, 0)).kind).toBe("unknown");
    // a bad position is unknown
    expect((await shareLinks.openDocumentFileAt(token, series.id, 9)).kind).toBe("unknown");
  });

  it("stops serving series files once the share is revoked", async () => {
    const { files, shareLinks } = setup();
    const series = await uploadSeries(files);
    const minted = await shareLinks.mint({ userId: "owner-1", documentIds: [series.id], ttl: "24h" });
    if (minted.kind !== "minted") throw new Error("mint failed");
    await shareLinks.revoke({ userId: "owner-1", documentId: series.id, shareId: minted.share.id });
    expect((await shareLinks.openDocumentFiles(minted.share.token, series.id)).kind).toBe("dead");
    expect((await shareLinks.openDocumentFileAt(minted.share.token, series.id, 0)).kind).toBe("dead");
  });
});
