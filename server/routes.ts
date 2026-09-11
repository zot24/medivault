import type { Express } from "express";
import multer from "multer";
import { storage } from "./storage";
import { setupLocalAuth, isAuthenticated } from "./localAuth";
import { createDocumentFiles } from "./document-files";
import {
  createObjectStoreFromEnv,
  ObjectStoreConfigError,
} from "./object-store";
import { insertSymptomSchema } from "@shared/schema";
import { z } from "zod";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only PDF and image files are allowed."));
    }
  },
});

let documentFiles:
  | ReturnType<typeof createDocumentFiles>
  | undefined;

function getDocumentFiles() {
  if (!documentFiles) {
    documentFiles = createDocumentFiles({
      objects: createObjectStoreFromEnv(process.env),
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
