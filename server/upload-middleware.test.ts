import { describe, expect, it, vi } from "vitest";
import multer from "multer";
import { MAX_DICOM_UPLOAD_BYTES } from "@shared/upload-kinds";
import { createUploadFilesOrReject } from "./upload-middleware";

function fakeRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("createUploadFilesOrReject", () => {
  it("answers 413 when multer rejects an oversize file", () => {
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(new multer.MulterError("LIMIT_FILE_SIZE"));
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware({} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      message: `File too large. Maximum is ${MAX_DICOM_UPLOAD_BYTES / 1024 / 1024} MB per file.`,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 400 for other multer errors, e.g. too many files", () => {
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE"));
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware({} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("answers 400 for a non-multer upload error", () => {
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(new Error("Invalid file type. Only PDF, image, and DICOM files are allowed."));
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware({} as any, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: "Invalid file type. Only PDF, image, and DICOM files are allowed.",
    });
  });

  it("calls next when the upload succeeds", () => {
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(null);
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware({} as any, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
