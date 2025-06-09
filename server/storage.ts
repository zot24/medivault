import {
  users,
  medicalDocuments,
  type User,
  type UpsertUser,
  type MedicalDocument,
  type InsertMedicalDocument,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, ilike, or } from "drizzle-orm";

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
  searchMedicalDocuments(userId: string, query: string): Promise<MedicalDocument[]>;
  getMedicalDocumentsByType(userId: string, type: string): Promise<MedicalDocument[]>;
  deleteMedicalDocument(id: number, userId: string): Promise<boolean>;
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
    let query = db
      .select()
      .from(medicalDocuments)
      .where(eq(medicalDocuments.userId, userId))
      .orderBy(desc(medicalDocuments.documentDate), desc(medicalDocuments.createdAt));
    
    if (limit) {
      query = query.limit(limit);
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
    return result.rowCount > 0;
  }
}

export const storage = new DatabaseStorage();
