import type { Express } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { setupAuth, isAuthenticated } from "./replitAuth";
import {
  insertMedicalDocumentSchema,
  insertSymptomSchema,
} from "@shared/schema";
import { z } from "zod";

// Configure multer for file uploads
const uploadDir = path.resolve(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow PDFs and images
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and image files are allowed.'));
    }
  },
});

export async function registerRoutes(app: Express): Promise<void> {
  // Auth middleware
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Medical documents routes
  app.get('/api/documents', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      
      if (!req.file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Validate request body
      const documentData = insertMedicalDocumentSchema.parse({
        userId,
        title: req.body.title,
        description: req.body.description,
        documentType: req.body.documentType,
        fileName: req.file.originalname,
        filePath: req.file.path,
        fileSize: req.file.size.toString(),
        mimeType: req.file.mimetype,
        documentDate: req.body.documentDate,
        doctorName: req.body.doctorName,
        facilityName: req.body.facilityName,
        tags: req.body.tags ? JSON.parse(req.body.tags) : [],
      });

      const document = await storage.createMedicalDocument(documentData);
      res.status(201).json(document);
    } catch (error) {
      // Clean up uploaded file on error
      if (req.file) {
        fs.unlink(req.file.path, () => {});
      }
      
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: error.errors });
      }
      
      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    }
  });

  app.get('/api/documents/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      const documentId = parseInt(req.params.id);
      
      const document = await storage.getMedicalDocument(documentId, userId);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      const deleted = await storage.deleteMedicalDocument(documentId, userId);
      
      if (deleted) {
        // Clean up file
        fs.unlink(document.filePath, () => {});
        res.json({ message: "Document deleted successfully" });
      } else {
        res.status(500).json({ message: "Failed to delete document" });
      }
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // Symptom tracking routes
  app.get('/api/symptoms', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
      
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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
      const userId = req.user.claims.sub;
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

  // Serve uploaded files
  app.get('/api/files/:filename', isAuthenticated, (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDir, filename);
    
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ message: "File not found" });
    }
  });

  return;
}
