import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { groupIntoStudies, withPrimaryPhases, type StudySummary } from "@shared/studies";
import { isPhaseCandidate, phaseInfoFromFiles, type PhaseSourceFile } from "@shared/phases";
import type { DocumentFile, MedicalDocument } from "@shared/schema";
import type { createDocumentFiles } from "./document-files";
import type { FrozenSymptom, Symptom } from "@shared/schema";
import { asObjectKey, type ObjectStore } from "./object-store";
import type { DocumentRecords } from "./document-files";

export type { FrozenSymptom };

export type ShareTtl = "1h" | "24h" | "7d";

export type RawShareToken = string & { readonly __brand: "RawShareToken" };
export type TokenHash = string & { readonly __brand: "TokenHash" };

export type ShareLife =
  | { kind: "live"; expiresAt: Date }
  | { kind: "expired"; expiresAt: Date }
  | { kind: "revoked"; expiresAt: Date; revokedAt: Date };

export type MintedShare = {
  id: number;
  documentId: number;
  documentIds: number[];
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  token: RawShareToken;
  path: string;
  symptomSnapshot: FrozenSymptom[] | null;
};

type ListedShareBase = {
  id: number;
  documentId: number;
  documentIds: number[];
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  symptomSnapshot: FrozenSymptom[] | null;
};

export type ListedShare =
  | (ListedShareBase & { life: "live" })
  | (ListedShareBase & { life: "expired" })
  | (ListedShareBase & { life: "revoked"; revokedAt: Date });

export type MintResult =
  | { kind: "minted"; share: MintedShare }
  | { kind: "not_owner" };

export type RevokeResult = "revoked" | "not_found";

export type SharedFile = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

export type SharedFileMeta = {
  id: number;
  title: string;
  fileName: string;
  mimeType: string;
};

export type PublicOpen =
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "file"; file: SharedFile };

/** A shared record as a visitor may see it: everything but who owns it and where it is stored. */
export type PublicDocument = Omit<MedicalDocument, "userId" | "filePath">;

export type PublicPacket =
  | { kind: "unknown" }
  | { kind: "dead" }
  | {
      kind: "packet";
      packet: {
        label: string | null;
        expiresAt: Date;
        files: SharedFileMeta[];
        /** Every shared record, ordinary documents and image series alike. */
        documents: PublicDocument[];
        /** The shared series grouped into studies, for the share portal's study view. */
        studies: StudySummary[];
        snapshot: FrozenSymptom[] | null;
      };
    };

export type PublicFileEntry = Omit<DocumentFile, "filePath" | "documentId" | "id" | "createdAt">;

export type PublicFiles =
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "files"; files: PublicFileEntry[] };

type OwnedFileService = Pick<
  ReturnType<typeof createDocumentFiles>,
  "listOwnedFiles" | "openOwnedFileAt" | "openOwnedFrame" | "openOwnedFrameRange"
>;

export type PublicFrame =
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "frame"; frame: NonNullable<Awaited<ReturnType<OwnedFileService["openOwnedFrame"]>>> };

export type PublicFrameRange =
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "frames"; frames: NonNullable<Awaited<ReturnType<OwnedFileService["openOwnedFrameRange"]>>> };

export function toPublicDocument(document: MedicalDocument): PublicDocument {
  const { userId: _userId, filePath: _filePath, ...rest } = document;
  return rest;
}

export type ShareLinkRow = {
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
};

export type ShareLinkRecords = {
  insert(
    row: Omit<ShareLinkRow, "id" | "createdAt">,
  ): Promise<ShareLinkRow>;
  listByDocument(createdBy: string, documentId: number): Promise<ShareLinkRow[]>;
  listByOwner(createdBy: string): Promise<ShareLinkRow[]>;
  findByTokenHash(tokenHash: TokenHash): Promise<ShareLinkRow | undefined>;
  revoke(input: {
    createdBy: string;
    documentId: number;
    shareId: number;
  }): Promise<RevokeResult>;
  revokeById(input: {
    createdBy: string;
    shareId: number;
  }): Promise<RevokeResult>;
};

export type SymptomRecords = {
  getMany(userId: string, ids: number[]): Promise<Symptom[]>;
};

const RAW_TOKEN = /^mv1_[A-Za-z0-9_-]{43}$/;

const TTL_MS: Record<ShareTtl, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export function parseRawToken(raw: string): RawShareToken | null {
  if (!RAW_TOKEN.test(raw)) {
    return null;
  }
  return raw as RawShareToken;
}

export function parseShareTtl(raw: unknown): ShareTtl | null {
  if (raw === "1h" || raw === "24h" || raw === "7d") {
    return raw;
  }
  return null;
}

export const createShareBodySchema = z.object({
  ttl: z.enum(["1h", "24h", "7d"]),
  label: z.string().trim().max(80).optional(),
});

export const createCaseShareBodySchema = z.object({
  documentIds: z.array(z.number().int().positive()).min(1).max(50),
  ttl: z.enum(["1h", "24h", "7d"]),
  label: z.string().trim().max(80).optional(),
  symptomIds: z.array(z.number().int().positive()).max(50).optional(),
});

export function lifeOf(
  row: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): ShareLife {
  if (row.revokedAt != null) {
    return {
      kind: "revoked",
      expiresAt: row.expiresAt,
      revokedAt: row.revokedAt,
    };
  }
  if (row.expiresAt.getTime() <= now.getTime()) {
    return { kind: "expired", expiresAt: row.expiresAt };
  }
  return { kind: "live", expiresAt: row.expiresAt };
}

export function freezeSymptom(row: Symptom): FrozenSymptom {
  return {
    id: row.id,
    symptomName: row.symptomName,
    severity: row.severity,
    description: row.description,
    location: row.location,
    duration: row.duration,
    triggers: row.triggers,
    medications: row.medications,
    notes: row.notes,
    dateRecorded: row.dateRecorded,
    timeOfDay: row.timeOfDay,
  };
}

function hashToken(token: RawShareToken): TokenHash {
  return createHash("sha256").update(token).digest("hex") as TokenHash;
}

function newRawToken(): RawShareToken {
  return `mv1_${randomBytes(32).toString("base64url")}` as RawShareToken;
}

function expiresAtFrom(ttl: ShareTtl, now: Date): Date {
  return new Date(now.getTime() + TTL_MS[ttl]);
}

function uniqueIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

function packetIds(row: ShareLinkRow): number[] {
  if (row.documentIds.length > 0) {
    return row.documentIds;
  }
  return [row.documentId];
}

function shareIncludesDocument(row: ShareLinkRow, documentId: number): boolean {
  return packetIds(row).includes(documentId);
}

function listedFrom(row: ShareLinkRow, now: Date): ListedShare {
  const life = lifeOf(row, now);
  const base = {
    id: row.id,
    documentId: row.documentId,
    documentIds: packetIds(row),
    label: row.label,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    symptomSnapshot: row.symptomSnapshot,
  };
  if (life.kind === "revoked") {
    return { ...base, revokedAt: life.revokedAt, life: "revoked" };
  }
  if (life.kind === "expired") {
    return { ...base, life: "expired" };
  }
  return { ...base, life: "live" };
}

export function createShareLinks(deps: {
  objects: ObjectStore;
  documents: Pick<DocumentRecords, "get">;
  /** Serves a shared series' files exactly as the owner's own endpoints do, scoped by the token. */
  documentFiles?: OwnedFileService;
  /** Per-file positions for phase detection on the shared studies' primary volumes. */
  phaseSources?: (documentIds: number[]) => Promise<(PhaseSourceFile & { documentId: number })[]>;
  shares: ShareLinkRecords;
  symptoms?: SymptomRecords;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  async function loadLiveRow(token: RawShareToken): Promise<
    { kind: "unknown" } | { kind: "dead" } | { kind: "live"; row: ShareLinkRow }
  > {
    const row = await deps.shares.findByTokenHash(hashToken(token));
    if (!row) {
      return { kind: "unknown" };
    }
    const life = lifeOf(row, now());
    if (life.kind !== "live") {
      return { kind: "dead" };
    }
    return { kind: "live", row };
  }

  async function fileFor(
    row: ShareLinkRow,
    documentId: number,
  ): Promise<PublicOpen> {
    if (!shareIncludesDocument(row, documentId)) {
      return { kind: "unknown" };
    }
    const document = await deps.documents.get(documentId, row.createdBy);
    if (!document) {
      return { kind: "unknown" };
    }
    const stored = await deps.objects.get(asObjectKey(document.filePath));
    if (!stored) {
      return { kind: "unknown" };
    }
    return {
      kind: "file",
      file: {
        bytes: stored.bytes,
        mimeType: document.mimeType,
        fileName: document.fileName,
      },
    };
  }

  async function studiesOf(documents: MedicalDocument[]): Promise<StudySummary[]> {
    const studies = groupIntoStudies(documents);
    if (!deps.phaseSources) {
      return studies;
    }
    const candidateIds = studies
      .map((study) => study.primary)
      .filter((p): p is MedicalDocument => !!p && isPhaseCandidate(p.dicomMeta, p.fileCount))
      .map((p) => p.id);
    const rows = await deps.phaseSources(candidateIds);
    const byDocument = new Map<number, PhaseSourceFile[]>();
    for (const row of rows) {
      const list = byDocument.get(row.documentId) ?? [];
      list.push(row);
      byDocument.set(row.documentId, list);
    }
    return withPrimaryPhases(
      studies,
      new Map(Array.from(byDocument.entries(), ([id, files]) => [id, phaseInfoFromFiles(files)] as const)),
    );
  }

  /** The live row for a token whose packet includes `documentId`, or why not. */
  async function loadSharedDocument(
    token: RawShareToken,
    documentId: number,
  ): Promise<{ kind: "unknown" } | { kind: "dead" } | { kind: "live"; row: ShareLinkRow }> {
    const loaded = await loadLiveRow(token);
    if (loaded.kind !== "live") {
      return loaded;
    }
    if (!shareIncludesDocument(loaded.row, documentId) || !deps.documentFiles) {
      return { kind: "unknown" };
    }
    return loaded;
  }

  return {
    async openDocumentFiles(token: RawShareToken, documentId: number): Promise<PublicFiles> {
      const loaded = await loadSharedDocument(token, documentId);
      if (loaded.kind !== "live") {
        return loaded;
      }
      const files = await deps.documentFiles!.listOwnedFiles(loaded.row.createdBy, documentId);
      if (!files) {
        return { kind: "unknown" };
      }
      return {
        kind: "files",
        files: files.map(({ filePath: _p, documentId: _d, id: _i, createdAt: _c, ...rest }) => rest),
      };
    },

    async openDocumentFileAt(token: RawShareToken, documentId: number, position: number): Promise<PublicOpen> {
      const loaded = await loadSharedDocument(token, documentId);
      if (loaded.kind !== "live") {
        return loaded;
      }
      const file = await deps.documentFiles!.openOwnedFileAt(loaded.row.createdBy, documentId, position);
      return file ? { kind: "file", file } : { kind: "unknown" };
    },

    async openDocumentFrame(token: RawShareToken, documentId: number, position: number, frame: number): Promise<PublicFrame> {
      const loaded = await loadSharedDocument(token, documentId);
      if (loaded.kind !== "live") {
        return loaded;
      }
      const opened = await deps.documentFiles!.openOwnedFrame(loaded.row.createdBy, documentId, position, frame);
      return opened ? { kind: "frame", frame: opened } : { kind: "unknown" };
    },

    async openDocumentFrameRange(token: RawShareToken, documentId: number, position: number, from: number, to: number): Promise<PublicFrameRange> {
      const loaded = await loadSharedDocument(token, documentId);
      if (loaded.kind !== "live") {
        return loaded;
      }
      const opened = await deps.documentFiles!.openOwnedFrameRange(loaded.row.createdBy, documentId, position, from, to);
      return opened ? { kind: "frames", frames: opened } : { kind: "unknown" };
    },

    async mint(input: {
      userId: string;
      documentId?: number;
      documentIds?: number[];
      ttl: ShareTtl;
      label: string | null;
      symptomIds?: number[];
    }): Promise<MintResult> {
      const documentIds = uniqueIds(
        input.documentId != null ? [input.documentId] : (input.documentIds ?? []),
      );
      if (documentIds.length === 0) {
        return { kind: "not_owner" };
      }

      for (const documentId of documentIds) {
        const document = await deps.documents.get(documentId, input.userId);
        if (!document) {
          return { kind: "not_owner" };
        }
      }

      let symptomSnapshot: FrozenSymptom[] | null = null;
      const symptomIds = uniqueIds(input.symptomIds ?? []);
      if (symptomIds.length > 0) {
        if (!deps.symptoms) {
          return { kind: "not_owner" };
        }
        const rows = await deps.symptoms.getMany(input.userId, symptomIds);
        if (rows.length !== symptomIds.length) {
          return { kind: "not_owner" };
        }
        const byId = new Map(rows.map((row) => [row.id, row]));
        symptomSnapshot = symptomIds.map((id) => freezeSymptom(byId.get(id)!));
      }

      const token = newRawToken();
      const row = await deps.shares.insert({
        tokenHash: hashToken(token),
        documentId: documentIds[0],
        documentIds,
        createdBy: input.userId,
        expiresAt: expiresAtFrom(input.ttl, now()),
        revokedAt: null,
        label: input.label,
        symptomSnapshot,
      });

      return {
        kind: "minted",
        share: {
          id: row.id,
          documentId: row.documentId,
          documentIds: packetIds(row),
          label: row.label,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          token,
          path: `/s/${token}`,
          symptomSnapshot: row.symptomSnapshot,
        },
      };
    },

    async list(input: {
      userId: string;
      documentId: number;
    }): Promise<ListedShare[] | "not_owner"> {
      const document = await deps.documents.get(input.documentId, input.userId);
      if (!document) {
        return "not_owner";
      }

      const rows = await deps.shares.listByDocument(
        input.userId,
        input.documentId,
      );
      const at = now();
      return rows.map((row) => listedFrom(row, at));
    },

    async listAll(input: { userId: string }): Promise<ListedShare[]> {
      const rows = await deps.shares.listByOwner(input.userId);
      const at = now();
      return rows.map((row) => listedFrom(row, at));
    },

    async revoke(input: {
      userId: string;
      documentId: number;
      shareId: number;
    }): Promise<RevokeResult> {
      return deps.shares.revoke({
        createdBy: input.userId,
        documentId: input.documentId,
        shareId: input.shareId,
      });
    },

    async revokeById(input: {
      userId: string;
      shareId: number;
    }): Promise<RevokeResult> {
      return deps.shares.revokeById({
        createdBy: input.userId,
        shareId: input.shareId,
      });
    },

    async openByToken(token: RawShareToken): Promise<PublicOpen> {
      const loaded = await loadLiveRow(token);
      if (loaded.kind !== "live") {
        return loaded;
      }
      return fileFor(loaded.row, packetIds(loaded.row)[0]);
    },

    async openFile(
      token: RawShareToken,
      documentId: number,
    ): Promise<PublicOpen> {
      const loaded = await loadLiveRow(token);
      if (loaded.kind !== "live") {
        return loaded;
      }
      return fileFor(loaded.row, documentId);
    },

    async openPacket(token: RawShareToken): Promise<PublicPacket> {
      const loaded = await loadLiveRow(token);
      if (loaded.kind !== "live") {
        return loaded;
      }

      const files: SharedFileMeta[] = [];
      const documents: MedicalDocument[] = [];
      for (const documentId of packetIds(loaded.row)) {
        const document = await deps.documents.get(
          documentId,
          loaded.row.createdBy,
        );
        if (!document) {
          continue;
        }
        documents.push(document);
        files.push({
          id: document.id,
          title: document.title,
          fileName: document.fileName,
          mimeType: document.mimeType,
        });
      }
      if (files.length === 0) {
        return { kind: "unknown" };
      }

      return {
        kind: "packet",
        packet: {
          label: loaded.row.label,
          expiresAt: loaded.row.expiresAt,
          files,
          documents: documents.map(toPublicDocument),
          studies: await studiesOf(documents),
          snapshot: loaded.row.symptomSnapshot,
        },
      };
    },
  };
}
