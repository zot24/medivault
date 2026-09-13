import multer from "multer";
import {
  classifyUpload,
  isVagueUploadMime,
  MAX_FILES_PER_REQUEST,
  MAX_UPLOAD_BYTES,
} from "@shared/upload-kinds";

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

const uploadFiles = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: MAX_FILES_PER_REQUEST },
]);

/**
 * Wraps a multer middleware so its errors reach the client as 4xx JSON
 * instead of falling through to the generic error handler as a 500 — an
 * oversize file becomes 413, everything else 400. Takes the multer runner
 * as a parameter so it can be exercised with a fake in tests.
 */
export function createUploadFilesOrReject(
  runUpload: (req: any, res: any, callback: (err: unknown) => void) => void,
) {
  return function uploadFilesOrReject(req: any, res: any, next: any) {
    runUpload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        return res.status(status).json({
          message:
            err.code === "LIMIT_FILE_SIZE"
              ? `File too large. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB per file.`
              : err.message,
        });
      }
      if (err) {
        return res.status(400).json({ message: (err as Error).message });
      }
      next();
    });
  };
}

export const uploadFilesOrReject = createUploadFilesOrReject(uploadFiles);
