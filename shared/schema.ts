import {
  pgTable,
  text,
  varchar,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  serial,
  date,
  integer,
  real,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import type { DicomFrameIndex, DicomSeriesMeta } from "./dicom-meta";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  password: varchar("password"), // For local auth (hashed)
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Medical documents table
export const medicalDocuments = pgTable("medical_documents", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  description: text("description"),
  documentType: varchar("document_type").notNull(), // 'lab_result', 'prescription', 'x_ray', 'consultation', 'other'
  fileName: varchar("file_name").notNull(),
  filePath: varchar("file_path").notNull(),
  fileSize: varchar("file_size").notNull(),
  mimeType: varchar("mime_type").notNull(),
  documentDate: date("document_date").notNull(),
  doctorName: varchar("doctor_name"),
  facilityName: varchar("facility_name"),
  tags: text("tags").array(),
  // A record is one document; a DICOM series is one record with many files.
  // file_name/file_path/mime_type describe the first file, file_size is the total.
  fileCount: integer("file_count").notNull().default(1),
  // Read from the first file when it's DICOM; null otherwise. Never carries
  // patient identifiers — see shared/dicom-meta.ts.
  dicomMeta: jsonb("dicom_meta").$type<DicomSeriesMeta | null>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Files belonging to a document, in display order (slice order for DICOM).
export const documentFiles = pgTable(
  "document_files",
  {
    id: serial("id").primaryKey(),
    documentId: integer("document_id")
      .notNull()
      .references(() => medicalDocuments.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    fileName: varchar("file_name").notNull(),
    filePath: varchar("file_path").notNull(),
    fileSize: integer("file_size").notNull(),
    mimeType: varchar("mime_type").notNull(),
    // (0008,0018) of a DICOM file; null for non-DICOM files. Lets an SR's
    // IMAGE content items resolve to a sibling record's file — see
    // shared/dicom-sr.ts.
    sopInstanceUid: varchar("sop_instance_uid"),
    // Per-file DICOM position metadata (shared/dicom-meta.ts readFileMeta),
    // null for non-DICOM files. Used by shared/phases.ts to detect a
    // multi-phase series (e.g. 10 cardiac phases x 580 slices).
    instanceNumber: integer("instance_number"), // (0020,0013)
    sliceLocation: real("slice_location"), // (0020,0032) z, else (0020,1041)
    phase: real("phase"), // (0020,9241) %, else (0018,1060) ms
    // Set only for an uncompressed multi-frame file (plan 07 angiography
    // runs) — see shared/dicom-meta.ts readFileMeta. Lets the frame endpoint
    // (server/routes.ts) serve one frame as an HTTP range read instead of
    // decoding or holding the whole file.
    frameIndex: jsonb("frame_index").$type<DicomFrameIndex | null>(),
    // Plan 13 (multi-view navigation): this file's own header fields, needed
    // to label one *view* of a multi-file ultrasound record or one *run* of
    // a multi-file angiography record — see shared/series-kind.ts.
    imageType: text("image_type").array(), // (0008,0008)
    positionerPrimaryAngle: real("positioner_primary_angle"), // (0018,1510)
    positionerSecondaryAngle: real("positioner_secondary_angle"), // (0018,1511)
    usRegionDataTypes: integer("us_region_data_types").array(), // (0018,6011) items' (0018,6014)
    numberOfFrames: integer("number_of_frames"), // (0028,0008), this file's own — not the record's dicomMeta.numberOfFrames (first file only)
    frameRate: real("frame_rate"), // CineRate (0018,0040) fps, else 1000 / FrameTime (0018,1063)
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("document_files_document_position_uidx").on(
      table.documentId,
      table.position,
    ),
  ],
);

// Symptom tracking table
export const symptoms = pgTable("symptoms", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  symptomName: varchar("symptom_name").notNull(),
  severity: integer("severity").notNull(), // 1-10 scale
  description: text("description"),
  location: varchar("location"), // body part/area
  duration: varchar("duration"), // "minutes", "hours", "days"
  triggers: text("triggers").array(),
  medications: text("medications").array(),
  notes: text("notes"),
  dateRecorded: date("date_recorded").notNull(),
  timeOfDay: varchar("time_of_day"), // "morning", "afternoon", "evening", "night"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type FrozenSymptom = {
  id: number;
  symptomName: string;
  severity: number;
  description: string | null;
  location: string | null;
  duration: string | null;
  triggers: string[] | null;
  medications: string[] | null;
  notes: string | null;
  dateRecorded: string;
  timeOfDay: string | null;
};

export const shareLinks = pgTable(
  "share_links",
  {
    id: serial("id").primaryKey(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    documentId: integer("document_id")
      .notNull()
      .references(() => medicalDocuments.id, { onDelete: "cascade" }),
    documentIds: integer("document_ids").array().notNull().default([]),
    createdBy: varchar("created_by")
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    label: varchar("label", { length: 80 }),
    symptomSnapshot: jsonb("symptom_snapshot").$type<FrozenSymptom[] | null>(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("share_links_token_hash_uidx").on(table.tokenHash),
    index("share_links_owner_document_idx").on(table.createdBy, table.documentId),
  ],
);

export const insertMedicalDocumentSchema = createInsertSchema(medicalDocuments, {
  // drizzle-zod can't derive a precise type for a $type<T>() jsonb column;
  // pin it to what shared/dicom-meta.ts actually produces.
  dicomMeta: z.custom<DicomSeriesMeta | null>().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSymptomSchema = createInsertSchema(symptoms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type MedicalDocument = typeof medicalDocuments.$inferSelect;
export type InsertMedicalDocument = z.infer<typeof insertMedicalDocumentSchema>;
export type DocumentFile = typeof documentFiles.$inferSelect;
export type InsertDocumentFile = typeof documentFiles.$inferInsert;
export type ShareLink = typeof shareLinks.$inferSelect;
export type InsertShareLink = typeof shareLinks.$inferInsert;
export type Symptom = typeof symptoms.$inferSelect;
export type InsertSymptom = z.infer<typeof insertSymptomSchema>;
