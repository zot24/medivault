import {
  users,
  medicalDocuments,
  symptoms,
  shareLinks,
  type User,
  type UpsertUser,
  type MedicalDocument,
  type InsertMedicalDocument,
  type ShareLink,
  type Symptom,
  type InsertSymptom,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ilike, or } from "drizzle-orm";
import type {
  RevokeResult,
  ShareLinkRow,
  TokenHash,
} from "./share-links";

// Interface for storage operations
export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Medical document operations
  createMedicalDocument(document: InsertMedicalDocument): Promise<MedicalDocument>;
  getMedicalDocuments(userId: string, limit?: number): Promise<MedicalDocument[]>;
  getMedicalDocument(id: number, userId: string): Promise<MedicalDocument | undefined>;
  getMedicalDocumentByFilePath(userId: string, filePath: string): Promise<MedicalDocument | undefined>;
  searchMedicalDocuments(userId: string, query: string): Promise<MedicalDocument[]>;
  getMedicalDocumentsByType(userId: string, type: string): Promise<MedicalDocument[]>;
  deleteMedicalDocument(id: number, userId: string): Promise<boolean>;

  insertShareLink(row: Omit<ShareLinkRow, "id" | "createdAt">): Promise<ShareLinkRow>;
  listShareLinksByDocument(createdBy: string, documentId: number): Promise<ShareLinkRow[]>;
  getShareLinkByTokenHash(tokenHash: TokenHash): Promise<ShareLinkRow | undefined>;
  revokeShareLink(input: {
    createdBy: string;
    documentId: number;
    shareId: number;
  }): Promise<RevokeResult>;
  
  // Symptom tracking operations
  createSymptom(symptom: InsertSymptom): Promise<Symptom>;
  getSymptoms(userId: string, limit?: number): Promise<Symptom[]>;
  getSymptomsByDateRange(userId: string, startDate: string, endDate: string): Promise<Symptom[]>;
  getSymptomsByName(userId: string, symptomName: string): Promise<Symptom[]>;
  updateSymptom(id: number, userId: string, updates: Partial<InsertSymptom>): Promise<Symptom | undefined>;
  deleteSymptom(id: number, userId: string): Promise<boolean>;
}

function asShareLinkRow(row: ShareLink): ShareLinkRow {
  return {
    id: row.id,
    tokenHash: row.tokenHash as TokenHash,
    documentId: row.documentId,
    createdBy: row.createdBy,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    label: row.label,
    createdAt: row.createdAt ?? new Date(),
  };
}

export class DatabaseStorage implements IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Medical document operations
  async createMedicalDocument(document: InsertMedicalDocument): Promise<MedicalDocument> {
    const [created] = await db
      .insert(medicalDocuments)
      .values(document)
      .returning();
    return created;
  }

  async getMedicalDocuments(userId: string, limit?: number): Promise<MedicalDocument[]> {
    const query = db
      .select()
      .from(medicalDocuments)
      .where(eq(medicalDocuments.userId, userId))
      .orderBy(desc(medicalDocuments.documentDate), desc(medicalDocuments.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    
    return await query;
  }

  async getMedicalDocument(id: number, userId: string): Promise<MedicalDocument | undefined> {
    const [document] = await db
      .select()
      .from(medicalDocuments)
      .where(and(
        eq(medicalDocuments.id, id),
        eq(medicalDocuments.userId, userId)
      ));
    return document;
  }

  async getMedicalDocumentByFilePath(userId: string, filePath: string): Promise<MedicalDocument | undefined> {
    const [document] = await db
      .select()
      .from(medicalDocuments)
      .where(and(
        eq(medicalDocuments.userId, userId),
        eq(medicalDocuments.filePath, filePath)
      ));
    return document;
  }

  async searchMedicalDocuments(userId: string, query: string): Promise<MedicalDocument[]> {
    return await db
      .select()
      .from(medicalDocuments)
      .where(and(
        eq(medicalDocuments.userId, userId),
        or(
          ilike(medicalDocuments.title, `%${query}%`),
          ilike(medicalDocuments.description, `%${query}%`),
          ilike(medicalDocuments.doctorName, `%${query}%`),
          ilike(medicalDocuments.facilityName, `%${query}%`)
        )
      ))
      .orderBy(desc(medicalDocuments.documentDate));
  }

  async getMedicalDocumentsByType(userId: string, type: string): Promise<MedicalDocument[]> {
    return await db
      .select()
      .from(medicalDocuments)
      .where(and(
        eq(medicalDocuments.userId, userId),
        eq(medicalDocuments.documentType, type)
      ))
      .orderBy(desc(medicalDocuments.documentDate));
  }

  async deleteMedicalDocument(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(medicalDocuments)
      .where(and(
        eq(medicalDocuments.id, id),
        eq(medicalDocuments.userId, userId)
      ));
    return (result.rowCount || 0) > 0;
  }

  async insertShareLink(
    row: Omit<ShareLinkRow, "id" | "createdAt">,
  ): Promise<ShareLinkRow> {
    const [created] = await db
      .insert(shareLinks)
      .values({
        tokenHash: row.tokenHash,
        documentId: row.documentId,
        createdBy: row.createdBy,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
        label: row.label,
      })
      .returning();
    return asShareLinkRow(created);
  }

  async listShareLinksByDocument(
    createdBy: string,
    documentId: number,
  ): Promise<ShareLinkRow[]> {
    const rows = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.createdBy, createdBy),
          eq(shareLinks.documentId, documentId),
        ),
      )
      .orderBy(desc(shareLinks.createdAt));
    return rows.map(asShareLinkRow);
  }

  async getShareLinkByTokenHash(
    tokenHash: TokenHash,
  ): Promise<ShareLinkRow | undefined> {
    const [row] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.tokenHash, tokenHash));
    return row ? asShareLinkRow(row) : undefined;
  }

  async revokeShareLink(input: {
    createdBy: string;
    documentId: number;
    shareId: number;
  }): Promise<RevokeResult> {
    const [row] = await db
      .select()
      .from(shareLinks)
      .where(
        and(
          eq(shareLinks.id, input.shareId),
          eq(shareLinks.documentId, input.documentId),
          eq(shareLinks.createdBy, input.createdBy),
        ),
      );
    if (!row) {
      return "not_found";
    }
    if (row.revokedAt == null) {
      await db
        .update(shareLinks)
        .set({ revokedAt: new Date() })
        .where(eq(shareLinks.id, row.id));
    }
    return "revoked";
  }

  // Symptom tracking operations
  async createSymptom(symptom: InsertSymptom): Promise<Symptom> {
    const [created] = await db
      .insert(symptoms)
      .values(symptom)
      .returning();
    return created;
  }

  async getSymptoms(userId: string, limit?: number): Promise<Symptom[]> {
    const query = db
      .select()
      .from(symptoms)
      .where(eq(symptoms.userId, userId))
      .orderBy(desc(symptoms.dateRecorded), desc(symptoms.createdAt));
    
    if (limit) {
      return await query.limit(limit);
    }
    
    return await query;
  }

  async getSymptomsByDateRange(userId: string, startDate: string, endDate: string): Promise<Symptom[]> {
    return await db
      .select()
      .from(symptoms)
      .where(and(
        eq(symptoms.userId, userId),
        // Using string comparison for dates in YYYY-MM-DD format
        desc(symptoms.dateRecorded)
      ))
      .orderBy(desc(symptoms.dateRecorded));
  }

  async getSymptomsByName(userId: string, symptomName: string): Promise<Symptom[]> {
    return await db
      .select()
      .from(symptoms)
      .where(and(
        eq(symptoms.userId, userId),
        ilike(symptoms.symptomName, `%${symptomName}%`)
      ))
      .orderBy(desc(symptoms.dateRecorded));
  }

  async updateSymptom(id: number, userId: string, updates: Partial<InsertSymptom>): Promise<Symptom | undefined> {
    const [updated] = await db
      .update(symptoms)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(symptoms.id, id),
        eq(symptoms.userId, userId)
      ))
      .returning();
    return updated;
  }

  async deleteSymptom(id: number, userId: string): Promise<boolean> {
    const result = await db
      .delete(symptoms)
      .where(and(
        eq(symptoms.id, id),
        eq(symptoms.userId, userId)
      ));
    return (result.rowCount || 0) > 0;
  }
}

export const storage = new DatabaseStorage();
