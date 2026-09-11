import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { asObjectKey, type ObjectStore } from "./object-store";
import type { DocumentRecords } from "./document-files";

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
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  token: RawShareToken;
  path: string;
};

export type ListedShare =
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: Date;
      expiresAt: Date;
      life: "live";
    }
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: Date;
      expiresAt: Date;
      life: "expired";
    }
  | {
      id: number;
      documentId: number;
      label: string | null;
      createdAt: Date;
      expiresAt: Date;
      revokedAt: Date;
      life: "revoked";
    };

export type MintResult =
  | { kind: "minted"; share: MintedShare }
  | { kind: "not_owner" };

export type RevokeResult = "revoked" | "not_found";

export type SharedFile = {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
};

export type PublicOpen =
  | { kind: "unknown" }
  | { kind: "dead" }
  | { kind: "file"; file: SharedFile };

export type ShareLinkRow = {
  id: number;
  tokenHash: TokenHash;
  documentId: number;
  createdBy: string;
  expiresAt: Date;
  revokedAt: Date | null;
  label: string | null;
  createdAt: Date;
};

export type ShareLinkRecords = {
  insert(
    row: Omit<ShareLinkRow, "id" | "createdAt">,
  ): Promise<ShareLinkRow>;
  listByDocument(createdBy: string, documentId: number): Promise<ShareLinkRow[]>;
  findByTokenHash(tokenHash: TokenHash): Promise<ShareLinkRow | undefined>;
  revoke(input: {
    createdBy: string;
    documentId: number;
    shareId: number;
  }): Promise<RevokeResult>;
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

function hashToken(token: RawShareToken): TokenHash {
  return createHash("sha256").update(token).digest("hex") as TokenHash;
}

function newRawToken(): RawShareToken {
  return `mv1_${randomBytes(32).toString("base64url")}` as RawShareToken;
}

function expiresAtFrom(ttl: ShareTtl, now: Date): Date {
  return new Date(now.getTime() + TTL_MS[ttl]);
}

function listedFrom(row: ShareLinkRow, now: Date): ListedShare {
  const life = lifeOf(row, now);
  const base = {
    id: row.id,
    documentId: row.documentId,
    label: row.label,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
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
  shares: ShareLinkRecords;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  return {
    async mint(input: {
      userId: string;
      documentId: number;
      ttl: ShareTtl;
      label: string | null;
    }): Promise<MintResult> {
      const document = await deps.documents.get(input.documentId, input.userId);
      if (!document) {
        return { kind: "not_owner" };
      }

      const token = newRawToken();
      const row = await deps.shares.insert({
        tokenHash: hashToken(token),
        documentId: input.documentId,
        createdBy: input.userId,
        expiresAt: expiresAtFrom(input.ttl, now()),
        revokedAt: null,
        label: input.label,
      });

      return {
        kind: "minted",
        share: {
          id: row.id,
          documentId: row.documentId,
          label: row.label,
          createdAt: row.createdAt,
          expiresAt: row.expiresAt,
          token,
          path: `/s/${token}`,
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

    async openByToken(token: RawShareToken): Promise<PublicOpen> {
      const row = await deps.shares.findByTokenHash(hashToken(token));
      if (!row) {
        return { kind: "unknown" };
      }

      const life = lifeOf(row, now());
      if (life.kind !== "live") {
        return { kind: "dead" };
      }

      const document = await deps.documents.get(row.documentId, row.createdBy);
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
    },
  };
}
