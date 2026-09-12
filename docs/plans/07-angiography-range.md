# Plan 07 — Angiography runs over the upload cap

Accept and play the catheterization cine runs: uncompressed 8-bit multi-frame files of ~100 MB each, served frame by frame with HTTP range reads so neither the server nor the browser holds a whole file.

Depends on plan 06 (multi-frame viewer, playback).

## Why

Study C is three XA runs, 92–108 frames of 1000×1000 8-bit MONOCHROME2, implicit VR little-endian (uncompressed), 15 fps, 1 MB per frame, 92–108 MB per file. Upload is refused ("File too large", 50 MB cap). Verified on the reference case: Supabase storage answers `Range` requests with `206 Partial Content` and `Accept-Ranges: bytes`, so a frame is a 1 MB range read at `pixelDataOffset + frame × rows × columns`.

## What to build

### A. Streaming upload for large DICOM

Raise the cap for DICOM only: `MAX_UPLOAD_BYTES` stays 50 MB for PDF/images; add `MAX_DICOM_UPLOAD_BYTES = 256 MB` in `shared/upload-kinds.ts`. Multer's memory storage would buffer 100 MB per request; switch the `files` field to `multer.diskStorage` into the OS temp dir and stream from disk to Supabase (`supabase.storage.from(bucket).upload(key, fs.createReadStream(path), { duplex: "half", contentType })` — supabase-js accepts a readable stream in Node). `ObjectStore.put` gains an overload taking a `Readable` plus `size`. Delete the temp file in `finally`. `classifyUpload` needs only the first 132 bytes — read them from the temp file, do not load it.

Multer limits differ per field: keep one `upload` instance with `fileSize: MAX_DICOM_UPLOAD_BYTES` and enforce the 50 MB non-DICOM cap in `classifyFiles` (`fitsUploadCap(size, mimeType)`).

### B. Frame index at upload

`readFileMeta` (plan 04) gains, for uncompressed transfer syntaxes (`1.2.840.10008.1.2`, `.1`, `.2`) with `NumberOfFrames > 1`: `pixelDataOffset` (`dataSet.elements.x7fe00010.dataOffset`), `frameBytes = rows × columns × samplesPerPixel × bitsAllocated / 8`, `numberOfFrames`. Store on `document_files` (`frameIndex: jsonb`). Reading the header of a 100 MB file must not load it all: parse only the first 4 KB + whatever precedes pixel data — `dicomParser.parseDicom(bytes, { untilTag: "x7fe00010" })` on the first 1 MB of the temp file is enough (the pixel data offset is the position of that element).

### C. Frame endpoint

`GET /api/documents/:id/files/:position/frames/:frame` → the raw frame bytes, `Content-Type: application/octet-stream`, plus headers `X-Frame-Rows`, `X-Frame-Columns`, `X-Frame-Bits`, `X-Frame-Photometric`, `X-Window-Center`, `X-Window-Width`. Implementation: `ObjectStore.getRange(key, start, end)` doing a `fetch` to `${SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${key}` with `Authorization: Bearer <service role key>` and `Range: bytes=start-end`; `MemoryObjectStore.getRange` slices the buffer for tests. Cache-Control `private, max-age=3600`.

For encapsulated (JPEG) multi-frame files (plan 06) the endpoint is not needed — those files are small enough to fetch whole. Return 404 for positions without a `frameIndex`.

### D. Viewer

For files with a `frameIndex`: the frame source is the endpoint; a frame is a `Uint8Array` of `rows × columns` bytes (8-bit mono) → build a `DicomMono8Frame` (add to `DicomFrame`: `kind: "mono8"`, `pixels: Uint8Array`, window from the headers; `rgbaFromFrame` handles it like `mono16` with slope 1 / intercept 0). Playback and scrubbing from plan 06. Preload the run with 4 parallel range requests before playing (~100 MB per run; show progress). Frame cache budget applies.

## Tests first

- `shared/upload-kinds.test.ts`: `fitsUploadCap(51 MB, "application/pdf")` false, `fitsUploadCap(200 MB, "application/dicom")` true, 300 MB false.
- `shared/dicom-meta.test.ts`: frame index for a 2-frame 4×4 8-bit uncompressed fixture (extend `buildMiniCtDicom` with `frames: number` and `bitsAllocated: 8`); offsets computed from the parsed element, not hard-coded.
- `server/object-store.test.ts`: `MemoryObjectStore.getRange`; `SupabaseObjectStore.getRange` builds the right URL and `Range` header (inject `fetch`).
- `server/document-files.test.ts`: `openOwnedFrame(userId, documentId, position, frame)` returns the right 16 bytes for frame 1 of the fixture and 404-equivalent for frame 2.
- `shared/dicom-frame.test.ts`: `rgbaFromFrame` on `mono8` with window 128/256 maps 0→0 and 255→255.

## Out of scope

Compressed multi-frame XA, DSA subtraction, ECG overlay, edge functions on Vercel (note: streaming through a Vercel serverless function has its own body limits; this plan targets the Node server).

## Verify

Upload the three runs (one record, or one per run). Each opens within a few seconds, plays at 15 fps, and the server process RSS stays flat while serving frames (`ps -o rss -p <pid>` before and after playing a run).
