import { describe, expect, it, vi } from "vitest";
import multer from "multer";
import { MAX_DICOM_UPLOAD_BYTES, MAX_REQUEST_UPLOAD_BYTES } from "@shared/upload-kinds";
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

  it("answers 413 when the request's files together exceed the aggregate cap, without calling next", () => {
    // 3 slices at 200 MB each: each fits multer's own per-file cap
    // (MAX_DICOM_UPLOAD_BYTES, 256 MB) alone, but 600 MB total is over the
    // 512 MB aggregate request cap.
    const req: any = {
      files: {
        files: [
          { path: "/tmp/a", size: 200 * 1024 * 1024 },
          { path: "/tmp/b", size: 200 * 1024 * 1024 },
          { path: "/tmp/c", size: 200 * 1024 * 1024 },
        ],
      },
    };
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(null);
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      message: `Upload too large. Maximum is ${MAX_REQUEST_UPLOAD_BYTES / 1024 / 1024} MB total per request.`,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next when the request's files are under the aggregate cap", () => {
    const req: any = {
      files: {
        files: [
          { path: "/tmp/a", size: 200 * 1024 * 1024 },
          { path: "/tmp/b", size: 200 * 1024 * 1024 },
        ],
      },
    };
    const runUpload = (_req: any, _res: any, cb: (err: unknown) => void) => {
      cb(null);
    };
    const middleware = createUploadFilesOrReject(runUpload);
    const res = fakeRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
