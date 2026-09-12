import type { Express } from "express";
import multer from "multer";
import { storage } from "./storage";
import { setupLocalAuth, isAuthenticated } from "./localAuth";
import { createDocumentFiles } from "./document-files";
import {
  createObjectStoreFromEnv,
  ObjectStoreConfigError,
  type ObjectStore,
} from "./object-store";
import {
  createShareLinks,
  createShareBodySchema,
  createCaseShareBodySchema,
  parseRawToken,
} from "./share-links";
import { insertSymptomSchema } from "@shared/schema";
import {
  classifyUpload,
  isVagueUploadMime,
  MAX_UPLOAD_BYTES,
} from "@shared/upload-kinds";
import { z } from "zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_UPLOAD_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const classified = classifyUpload({
      mimeType: file.mimetype,
      originalName: file.originalname,
    });
    if (classified) {
      file.mimetype = classified.mimeType;
      cb(null, true);
      return;
    }
    if (isVagueUploadMime(file.mimetype.trim().toLowerCase())) {
      cb(null, true);
      return;
    }
    cb(
      new Error(
        "Invalid file type. Only PDF, image, and DICOM files are allowed.",
      ),
    );
  },
});

let objectStore: ObjectStore | undefined;
let documentFiles:
  | ReturnType<typeof createDocumentFiles>
  | undefined;
let shareLinks:
  | ReturnType<typeof createShareLinks>
  | undefined;

function getObjectStore() {
  if (!objectStore) {
    objectStore = createObjectStoreFromEnv(process.env);
  }
  return objectStore;
}

function getDocumentFiles() {
  if (!documentFiles) {
    documentFiles = createDocumentFiles({
      objects: getObjectStore(),
      documents: {
        create: (document) => storage.createMedicalDocument(document),
        findByFilePath: (userId, filePath) =>
          storage.getMedicalDocumentByFilePath(userId, filePath),
        get: (id, userId) => storage.getMedicalDocument(id, userId),
        delete: (id, userId) => storage.deleteMedicalDocument(id, userId),
      },
    });
  }
  return documentFiles;
}

function getShareLinks() {
  if (!shareLinks) {
    shareLinks = createShareLinks({
      objects: getObjectStore(),
      documents: {
        get: (id, userId) => storage.getMedicalDocument(id, userId),
      },
      shares: {
        insert: (row) => storage.insertShareLink(row),
        listByDocument: (createdBy, documentId) =>
          storage.listShareLinksByDocument(createdBy, documentId),
        listByOwner: (createdBy) => storage.listShareLinksByOwner(createdBy),
        findByTokenHash: (tokenHash) =>
          storage.getShareLinkByTokenHash(tokenHash),
        revoke: (input) => storage.revokeShareLink(input),
        revokeById: (input) => storage.revokeShareLinkById(input),
      },
      symptoms: {
        getMany: (userId, ids) => storage.getSymptomsByIds(userId, ids),
      },
    });
  }
  return shareLinks;
}

export async function registerRoutes(app: Express): Promise<void> {
  // Auth middleware (local auth for development)
  await setupLocalAuth(app);

  // Medical documents routes
  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const documents = await storage.getMedicalDocuments(userId, limit);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.get('/api/documents/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      const documents = await storage.searchMedicalDocuments(userId, query);
      res.json(documents);
    } catch (error) {
      console.error("Error searching documents:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  app.get('/api/documents/type/:type', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const type = req.params.type;
      const documents = await storage.getMedicalDocumentsByType(userId, type);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents by type:", error);
      res.status(500).json({ message: "Failed to fetch documents by type" });
    }
  });

  app.post('/api/documents', isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const document = await getDocumentFiles().uploadOwnedDocument({
        userId,
        bytes: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname,
        title: req.body.title,
        description: req.body.description,
        documentType: req.body.documentType,
        documentDate: req.body.documentDate,
        doctorName: req.body.doctorName,
        facilityName: req.body.facilityName,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      });

      res.status(201).json(document);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.get('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const documentId = parseInt(req.params.id);
      
      const document = await storage.getMedicalDocument(documentId, userId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.delete('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const documentId = parseInt(req.params.id);
      const result = await getDocumentFiles().removeOwnedDocument(userId, documentId);

      if (result === "not_found") {
        return res.status(404).json({ message: "Document not found" });
      }

      res.json({ message: "Document deleted successfully" });
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  app.post("/api/documents/:id/shares", isAuthenticated, async (req: any, res) => {
    try {
      const body = createShareBodySchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Validation error" });
      }
      const minted = await getShareLinks().mint({
        userId: req.user.id,
        documentId: parseInt(req.params.id, 10),
        ttl: body.data.ttl,
        label: body.data.label ?? null,
      });
      if (minted.kind === "not_owner") {
        return res.status(404).json({ message: "Document not found" });
      }
      return res.status(201).json(minted.share);
    } catch (error) {
      console.error("Error creating share:", error);
      res.status(500).json({ message: "Failed to create share" });
    }
  });

  app.get("/api/documents/:id/shares", isAuthenticated, async (req: any, res) => {
    try {
      const listed = await getShareLinks().list({
        userId: req.user.id,
        documentId: parseInt(req.params.id, 10),
      });
      if (listed === "not_owner") {
        return res.status(404).json({ message: "Document not found" });
      }
      return res.json(listed);
    } catch (error) {
      console.error("Error listing shares:", error);
      res.status(500).json({ message: "Failed to list shares" });
    }
  });

  app.delete(
    "/api/documents/:id/shares/:shareId",
    isAuthenticated,
    async (req: any, res) => {
      try {
        const result = await getShareLinks().revoke({
          userId: req.user.id,
          documentId: parseInt(req.params.id, 10),
          shareId: parseInt(req.params.shareId, 10),
        });
        if (result === "not_found") {
          return res.status(404).json({ message: "Share not found" });
        }
        return res.status(204).end();
      } catch (error) {
        console.error("Error revoking share:", error);
        res.status(500).json({ message: "Failed to revoke share" });
      }
    },
  );

  app.post("/api/shares", isAuthenticated, async (req: any, res) => {
    try {
      const body = createCaseShareBodySchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ message: "Validation error" });
      }
      const minted = await getShareLinks().mint({
        userId: req.user.id,
        documentIds: body.data.documentIds,
        ttl: body.data.ttl,
        label: body.data.label ?? null,
        symptomIds: body.data.symptomIds,
      });
      if (minted.kind === "not_owner") {
        return res.status(404).json({ message: "Document not found" });
      }
      return res.status(201).json(minted.share);
    } catch (error) {
      console.error("Error creating share:", error);
      res.status(500).json({ message: "Failed to create share" });
    }
  });

  app.get("/api/shares", isAuthenticated, async (req: any, res) => {
    try {
      const listed = await getShareLinks().listAll({ userId: req.user.id });
      return res.json(listed);
    } catch (error) {
      console.error("Error listing shares:", error);
      res.status(500).json({ message: "Failed to list shares" });
    }
  });

  app.delete("/api/shares/:shareId", isAuthenticated, async (req: any, res) => {
    try {
      const result = await getShareLinks().revokeById({
        userId: req.user.id,
        shareId: parseInt(req.params.shareId, 10),
      });
      if (result === "not_found") {
        return res.status(404).json({ message: "Share not found" });
      }
      return res.status(204).end();
    } catch (error) {
      console.error("Error revoking share:", error);
      res.status(500).json({ message: "Failed to revoke share" });
    }
  });

  app.get("/api/s/:token", async (req, res) => {
    try {
      const token = parseRawToken(req.params.token);
      if (!token) {
        return res.status(404).json({ message: "Not found" });
      }
      const opened = await getShareLinks().openPacket(token);
      if (opened.kind === "unknown") {
        return res.status(404).json({ message: "Not found" });
      }
      if (opened.kind === "dead") {
        return res.status(410).json({ message: "Gone" });
      }
      res.setHeader("Cache-Control", "private, no-store");
      return res.json(opened.packet);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      console.error("Error opening share:", error);
      res.status(500).json({ message: "Failed to open share" });
    }
  });

  app.get("/api/s/:token/files/:documentId", async (req, res) => {
    try {
      const token = parseRawToken(req.params.token);
      const documentId = parseInt(req.params.documentId, 10);
      if (!token || !Number.isInteger(documentId)) {
        return res.status(404).json({ message: "Not found" });
      }
      const opened = await getShareLinks().openFile(token, documentId);
      if (opened.kind === "unknown") {
        return res.status(404).json({ message: "Not found" });
      }
      if (opened.kind === "dead") {
        return res.status(410).json({ message: "Gone" });
      }
      res.setHeader("Content-Type", opened.file.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${opened.file.fileName.replace(/"/g, "")}"`,
      );
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(opened.file.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      console.error("Error opening share file:", error);
      res.status(500).json({ message: "Failed to open share" });
    }
  });

  // Symptom tracking routes
  app.get('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const symptoms = await storage.getSymptoms(userId, limit);
      res.json(symptoms);
    } catch (error) {
      console.error("Error fetching symptoms:", error);
      res.status(500).json({ message: "Failed to fetch symptoms" });
    }
  });

  app.post('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      const symptomData = insertSymptomSchema.parse({
        userId,
        symptomName: req.body.symptomName,
        severity: parseInt(req.body.severity),
        description: req.body.description,
        location: req.body.location,
        duration: req.body.duration,
        triggers: req.body.triggers || [],
        medications: req.body.medications || [],
        notes: req.body.notes,
        dateRecorded: req.body.dateRecorded,
        timeOfDay: req.body.timeOfDay,
      });

      const symptom = await storage.createSymptom(symptomData);
      res.status(201).json(symptom);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      
      console.error("Error creating symptom:", error);
      res.status(500).json({ message: "Failed to create symptom" });
    }
  });

  app.get('/api/symptoms/search', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const query = req.query.q as string;
      
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      
      const symptoms = await storage.getSymptomsByName(userId, query);
      res.json(symptoms);
    } catch (error) {
      console.error("Error searching symptoms:", error);
      res.status(500).json({ message: "Failed to search symptoms" });
    }
  });

  app.put('/api/symptoms/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const symptomId = parseInt(req.params.id);
      
      const updates = {
        symptomName: req.body.symptomName,
        severity: req.body.severity ? parseInt(req.body.severity) : undefined,
        description: req.body.description,
        location: req.body.location,
        duration: req.body.duration,
        triggers: req.body.triggers,
        medications: req.body.medications,
        notes: req.body.notes,
        dateRecorded: req.body.dateRecorded,
        timeOfDay: req.body.timeOfDay,
      };

      // Remove undefined values
      Object.keys(updates).forEach(key => {
        if ((updates as any)[key] === undefined) {
          delete (updates as any)[key];
        }
      });
      
      const symptom = await storage.updateSymptom(symptomId, userId, updates);
      
      if (!symptom) {
        return res.status(404).json({ message: "Symptom not found" });
      }
      
      res.json(symptom);
    } catch (error) {
      console.error("Error updating symptom:", error);
      res.status(500).json({ message: "Failed to update symptom" });
    }
  });

  app.delete('/api/symptoms/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const symptomId = parseInt(req.params.id);
      
      const deleted = await storage.deleteSymptom(symptomId, userId);
      
      if (deleted) {
        res.json({ message: "Symptom deleted successfully" });
      } else {
        res.status(404).json({ message: "Symptom not found" });
      }
    } catch (error) {
      console.error("Error deleting symptom:", error);
      res.status(500).json({ message: "Failed to delete symptom" });
    }
  });

  app.get('/api/files/:filename', isAuthenticated, async (req: any, res) => {
    try {
      const owned = await getDocumentFiles().openOwnedFile(
        req.user.id,
        req.params.filename,
      );

      if (!owned) {
        return res.status(404).json({ message: "File not found" });
      }

      res.setHeader("Content-Type", owned.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${owned.fileName.replace(/"/g, "")}"`,
      );
      res.send(owned.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      console.error("Error reading file:", error);
      res.status(500).json({ message: "Failed to read file" });
    }
  });

  return;
}
