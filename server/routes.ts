import type { Express } from "express";
import fs from "fs";
import { storage } from "./storage";
import { setupLocalAuth, isAuthenticated } from "./localAuth";
import { createDocumentFiles, MAX_FRAME_RANGE, type UploadFile } from "./document-files";
import { uploadFilesOrReject } from "./upload-middleware";
import {
  createObjectStoreFromEnv,
  ObjectStoreConfigError,
  ObjectTooLargeError,
  type ObjectStore,
} from "./object-store";
import {
  createShareLinks,
  createShareBodySchema,
  createCaseShareBodySchema,
  parseRawToken,
  type RawShareToken,
} from "./share-links";
import { insertSymptomSchema } from "@shared/schema";
import { groupIntoStudies, withPrimaryPhases } from "@shared/studies";
import { isPhaseCandidate, phaseInfoFromFiles } from "@shared/phases";
import { z } from "zod";

/** multer.diskStorage puts every field's files on disk (plan 07) — never a Buffer. */
function multerFilesOf(req: any): Express.Multer.File[] {
  const groups = req.files ?? {};
  return [...(groups.file ?? []), ...(groups.files ?? [])];
}

function uploadedFiles(req: any): UploadFile[] {
  return multerFilesOf(req).map((file) => ({
    path: file.path,
    size: file.size,
    mimeType: file.mimetype,
    originalName: file.originalname,
  }));
}

/**
 * Removes every multer temp file for this request. document-files.ts's
 * putAll already deletes a file once it has streamed it to the object
 * store; this is the backstop for the files of a request that never got
 * that far (rejected before or during classification, or a sibling file in
 * the same batch failed) — multer's own temp dir is never swept on its own.
 */
async function cleanupUploadedFiles(req: any): Promise<void> {
  await Promise.all(
    multerFilesOf(req).map((file) => fs.promises.unlink(file.path).catch(() => {})),
  );
}

function isUploadRejection(message: string): boolean {
  return (
    message.startsWith("Invalid file type") ||
    message === "File too large" ||
    message === "No file uploaded" ||
    message === "All files in a series must be DICOM."
  );
}

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
        createFiles: (files) => storage.createDocumentFiles(files),
        listFiles: (documentId) => storage.listDocumentFiles(documentId),
        updateTotals: (id, totals) => storage.updateDocumentTotals(id, totals),
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
      documentFiles: getDocumentFiles(),
      phaseSources: (ids) => storage.listPhaseSourceFiles(ids),
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

  // Records grouped into studies by dicomMeta.studyInstanceUid; records
  // without dicomMeta (non-DICOM documents) are not studies.
  app.get('/api/studies', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const documents = await storage.getMedicalDocuments(userId);
      const studies = groupIntoStudies(documents);
      // Phase detection needs per-file positions; do it here, once, for the
      // few primary volumes that can be multi-phase, instead of every list
      // in the client fetching a 5,800-row file list per study.
      const candidateIds = studies
        .map((study) => study.primary)
        .filter((p): p is NonNullable<typeof p> => !!p && isPhaseCandidate(p.dicomMeta, p.fileCount))
        .map((p) => p.id);
      const rows = await storage.listPhaseSourceFiles(candidateIds);
      const byDocument = new Map<number, typeof rows>();
      for (const row of rows) {
        (byDocument.get(row.documentId) ?? byDocument.set(row.documentId, []).get(row.documentId)!).push(row);
      }
      const phasesById = new Map(
        Array.from(byDocument.entries(), ([id, files]) => [id, phaseInfoFromFiles(files)] as const),
      );
      res.json(withPrimaryPhases(studies, phasesById));
    } catch (error) {
      console.error("Error fetching studies:", error);
      res.status(500).json({ message: "Failed to fetch studies" });
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

  // One request creates one record. Send `files` (many, all DICOM) for a
  // series or a single `file`; long series continue with POST /:id/files.
  app.post('/api/documents', isAuthenticated, uploadFilesOrReject, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const files = uploadedFiles(req);
      if (files.length === 0) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const document = await getDocumentFiles().uploadOwnedDocument({
        userId,
        files,
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
      if (error instanceof ObjectTooLargeError) {
        return res.status(413).json({ message: error.message });
      }
      if (error instanceof Error && isUploadRejection(error.message)) {
        return res.status(400).json({ message: error.message });
      }

      console.error("Error uploading document:", error);
      res.status(500).json({ message: "Failed to upload document" });
    } finally {
      await cleanupUploadedFiles(req);
    }
  });

  app.post('/api/documents/:id/files', isAuthenticated, uploadFilesOrReject, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id, 10);
      if (!Number.isInteger(documentId)) {
        return res.status(404).json({ message: "Document not found" });
      }
      const files = uploadedFiles(req);
      if (files.length === 0) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      const result = await getDocumentFiles().appendOwnedFiles(req.user.id, documentId, files);
      if (result.kind === "not_found") {
        return res.status(404).json({ message: "Document not found" });
      }
      if (result.kind === "rejected") {
        return res.status(400).json({ message: result.message });
      }
      res.status(201).json({ fileCount: result.fileCount });
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      if (error instanceof ObjectTooLargeError) {
        return res.status(413).json({ message: error.message });
      }
      if (error instanceof Error && isUploadRejection(error.message)) {
        return res.status(400).json({ message: error.message });
      }
      console.error("Error appending files:", error);
      res.status(500).json({ message: "Failed to upload files" });
    } finally {
      await cleanupUploadedFiles(req);
    }
  });

  app.get('/api/documents/:id/files', isAuthenticated, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id, 10);
      if (!Number.isInteger(documentId)) {
        return res.status(404).json({ message: "Document not found" });
      }
      const files = await getDocumentFiles().listOwnedFiles(req.user.id, documentId);
      if (!files) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(
        files.map((file) => ({
          position: file.position,
          fileName: file.fileName,
          fileSize: file.fileSize,
          mimeType: file.mimeType,
          sopInstanceUid: file.sopInstanceUid,
          instanceNumber: file.instanceNumber,
          sliceLocation: file.sliceLocation,
          phase: file.phase,
          // Plan 13: this file's own header fields, so the viewer and study
          // page can label one view of an echo record / one run of an
          // angiography record without fetching the file itself.
          imageType: file.imageType,
          positionerPrimaryAngle: file.positionerPrimaryAngle,
          positionerSecondaryAngle: file.positionerSecondaryAngle,
          usRegionDataTypes: file.usRegionDataTypes,
          numberOfFrames: file.numberOfFrames,
          frameRate: file.frameRate,
          // Present only for an uncompressed multi-frame file (plan 07):
          // tells the client to use the .../frames/:frame (or, for a batch,
          // .../frames/:from-:to — plan 12) range endpoints instead of
          // fetching the whole file. Deliberately a subset of the server's
          // own DicomFrameIndex — enough to size and split a batch read
          // (frameBytes) and to know the image's shape up front (rows,
          // columns) without a probe fetch of frame 0; windowCenter/Width
          // still come from that probe.
          frameIndex: file.frameIndex
            ? {
                numberOfFrames: file.frameIndex.numberOfFrames,
                frameBytes: file.frameIndex.frameBytes,
                rows: file.frameIndex.rows,
                columns: file.frameIndex.columns,
              }
            : null,
        })),
      );
    } catch (error) {
      console.error("Error listing files:", error);
      res.status(500).json({ message: "Failed to list files" });
    }
  });

  app.get('/api/documents/:id/files/:position', isAuthenticated, async (req: any, res) => {
    try {
      const documentId = parseInt(req.params.id, 10);
      const position = parseInt(req.params.position, 10);
      if (!Number.isInteger(documentId) || !Number.isInteger(position) || position < 0) {
        return res.status(404).json({ message: "File not found" });
      }
      const owned = await getDocumentFiles().openOwnedFileAt(req.user.id, documentId, position);
      if (!owned) {
        return res.status(404).json({ message: "File not found" });
      }
      res.setHeader("Content-Type", owned.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${owned.fileName.replace(/"/g, "")}"`,
      );
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.send(owned.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) {
        return res.status(503).json({ message: error.message });
      }
      console.error("Error reading file:", error);
      res.status(500).json({ message: "Failed to read file" });
    }
  });

  // An inclusive batch of frames of an uncompressed multi-frame DICOM file
  // (plan 12), served as one fixed byte range — what the whole-run preload
  // uses instead of one request per frame. Registered before the
  // single-frame route below: with no dash, "/frames/5" only matches
  // `:frame`, but the reverse order would let `:frame`'s single named
  // param — which matches any non-slash text, dashes included — swallow
  // "/frames/3-10" as frame "3-10" (parseInt reads that as 3) before this
  // route ever saw it.
  app.get(
    '/api/documents/:id/files/:position/frames/:from-:to',
    isAuthenticated,
    async (req: any, res) => {
      try {
        const documentId = parseInt(req.params.id, 10);
        const position = parseInt(req.params.position, 10);
        const from = parseInt(req.params.from, 10);
        const to = parseInt(req.params.to, 10);
        if (
          !Number.isInteger(documentId) ||
          !Number.isInteger(position) ||
          position < 0 ||
          !Number.isInteger(from) ||
          !Number.isInteger(to) ||
          from < 0 ||
          to < from ||
          to - from + 1 > MAX_FRAME_RANGE
        ) {
          return res.status(404).json({ message: "Frame range not found" });
        }
        const owned = await getDocumentFiles().openOwnedFrameRange(
          req.user.id,
          documentId,
          position,
          from,
          to,
        );
        if (!owned) {
          return res.status(404).json({ message: "Frame range not found" });
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("X-Frame-Rows", String(owned.rows));
        res.setHeader("X-Frame-Columns", String(owned.columns));
        res.setHeader("X-Frame-Bits", String(owned.bitsAllocated));
        res.setHeader("X-Frame-Photometric", owned.photometric);
        res.setHeader("X-Window-Center", String(owned.windowCenter));
        res.setHeader("X-Window-Width", String(owned.windowWidth));
        res.setHeader("X-Frame-From", String(owned.from));
        res.setHeader("X-Frame-To", String(owned.to));
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(owned.bytes);
      } catch (error) {
        if (error instanceof ObjectStoreConfigError) {
          return res.status(503).json({ message: error.message });
        }
        console.error("Error reading frame range:", error);
        res.status(500).json({ message: "Failed to read frame range" });
      }
    },
  );

  // One frame of an uncompressed multi-frame DICOM file (plan 07:
  // angiography cine runs), served as a fixed byte range so neither the
  // server nor the browser ever holds the whole ~100 MB file. 404 for a
  // position with no frame index — an encapsulated (JPEG) multi-frame file
  // is small enough to fetch whole via GET .../files/:position instead.
  app.get(
    '/api/documents/:id/files/:position/frames/:frame',
    isAuthenticated,
    async (req: any, res) => {
      try {
        const documentId = parseInt(req.params.id, 10);
        const position = parseInt(req.params.position, 10);
        const frame = parseInt(req.params.frame, 10);
        if (
          !Number.isInteger(documentId) ||
          !Number.isInteger(position) ||
          position < 0 ||
          !Number.isInteger(frame) ||
          frame < 0
        ) {
          return res.status(404).json({ message: "Frame not found" });
        }
        const owned = await getDocumentFiles().openOwnedFrame(
          req.user.id,
          documentId,
          position,
          frame,
        );
        if (!owned) {
          return res.status(404).json({ message: "Frame not found" });
        }
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("X-Frame-Rows", String(owned.rows));
        res.setHeader("X-Frame-Columns", String(owned.columns));
        res.setHeader("X-Frame-Bits", String(owned.bitsAllocated));
        res.setHeader("X-Frame-Photometric", owned.photometric);
        res.setHeader("X-Window-Center", String(owned.windowCenter));
        res.setHeader("X-Window-Width", String(owned.windowWidth));
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.send(owned.bytes);
      } catch (error) {
        if (error instanceof ObjectStoreConfigError) {
          return res.status(503).json({ message: error.message });
        }
        console.error("Error reading frame:", error);
        res.status(500).json({ message: "Failed to read frame" });
      }
    },
  );

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

  // Share portal: a visitor with a live token reads a shared series exactly
  // as its owner does — file list, one file, one frame, a frame batch —
  // scoped by the token, never by a session. Same headers as the owner's
  // routes above, but never cached by shared caches.
  function sharedParams(req: any): { token: RawShareToken; documentId: number; position: number } | null {
    const token = parseRawToken(req.params.token);
    const documentId = parseInt(req.params.id, 10);
    const position = req.params.position == null ? 0 : parseInt(req.params.position, 10);
    if (!token || !Number.isInteger(documentId) || !Number.isInteger(position) || position < 0) {
      return null;
    }
    return { token, documentId, position };
  }

  function sharedStatus(kind: "unknown" | "dead", res: any) {
    return kind === "dead"
      ? res.status(410).json({ message: "Gone" })
      : res.status(404).json({ message: "Not found" });
  }

  app.get("/api/s/:token/documents/:id/files", async (req, res) => {
    try {
      const p = sharedParams(req);
      if (!p) return res.status(404).json({ message: "Not found" });
      const opened = await getShareLinks().openDocumentFiles(p.token, p.documentId);
      if (opened.kind !== "files") return sharedStatus(opened.kind, res);
      res.setHeader("Cache-Control", "private, no-store");
      return res.json(opened.files);
    } catch (error) {
      console.error("Error listing shared files:", error);
      res.status(500).json({ message: "Failed to open share" });
    }
  });

  app.get("/api/s/:token/documents/:id/files/:position/frames/:from-:to", async (req, res) => {
    try {
      const p = sharedParams(req);
      const from = parseInt(req.params.from, 10);
      const to = parseInt(req.params.to, 10);
      if (!p || !Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < from) {
        return res.status(404).json({ message: "Not found" });
      }
      const opened = await getShareLinks().openDocumentFrameRange(p.token, p.documentId, p.position, from, to);
      if (opened.kind !== "frames") return sharedStatus(opened.kind, res);
      const owned = opened.frames;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Frame-Rows", String(owned.rows));
      res.setHeader("X-Frame-Columns", String(owned.columns));
      res.setHeader("X-Frame-Bits", String(owned.bitsAllocated));
      res.setHeader("X-Frame-Photometric", owned.photometric);
      res.setHeader("X-Window-Center", String(owned.windowCenter));
      res.setHeader("X-Window-Width", String(owned.windowWidth));
      res.setHeader("X-Frame-From", String(owned.from));
      res.setHeader("X-Frame-To", String(owned.to));
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(owned.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) return res.status(503).json({ message: error.message });
      console.error("Error reading shared frame range:", error);
      res.status(500).json({ message: "Failed to open share" });
    }
  });

  app.get("/api/s/:token/documents/:id/files/:position/frames/:frame", async (req, res) => {
    try {
      const p = sharedParams(req);
      const frame = parseInt(req.params.frame, 10);
      if (!p || !Number.isInteger(frame) || frame < 0) return res.status(404).json({ message: "Not found" });
      const opened = await getShareLinks().openDocumentFrame(p.token, p.documentId, p.position, frame);
      if (opened.kind !== "frame") return sharedStatus(opened.kind, res);
      const owned = opened.frame;
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("X-Frame-Rows", String(owned.rows));
      res.setHeader("X-Frame-Columns", String(owned.columns));
      res.setHeader("X-Frame-Bits", String(owned.bitsAllocated));
      res.setHeader("X-Frame-Photometric", owned.photometric);
      res.setHeader("X-Window-Center", String(owned.windowCenter));
      res.setHeader("X-Window-Width", String(owned.windowWidth));
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(owned.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) return res.status(503).json({ message: error.message });
      console.error("Error reading shared frame:", error);
      res.status(500).json({ message: "Failed to open share" });
    }
  });

  app.get("/api/s/:token/documents/:id/files/:position", async (req, res) => {
    try {
      const p = sharedParams(req);
      if (!p) return res.status(404).json({ message: "Not found" });
      const opened = await getShareLinks().openDocumentFileAt(p.token, p.documentId, p.position);
      if (opened.kind !== "file") return sharedStatus(opened.kind, res);
      res.setHeader("Content-Type", opened.file.mimeType);
      res.setHeader("Content-Disposition", `inline; filename="${opened.file.fileName.replace(/"/g, "")}"`);
      res.setHeader("Cache-Control", "private, no-store");
      return res.send(opened.file.bytes);
    } catch (error) {
      if (error instanceof ObjectStoreConfigError) return res.status(503).json({ message: error.message });
      console.error("Error reading shared file:", error);
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
