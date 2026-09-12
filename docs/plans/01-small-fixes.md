# Plan 01 — Small fixes

Three defects found while loading the reference case. Independent of each other; one PR.

## 1. Document date renders one day early

**Symptom.** A record uploaded with `documentDate: "2026-09-11"` shows "Sep 10, 2026" on the card for users west of UTC.

**Cause.** `client/src/components/document-card.tsx` does `format(new Date(medicalDocument.documentDate), "MMM d, yyyy")`. `new Date("2026-09-11")` parses a date-only ISO string as UTC midnight; `format` then prints it in local time.

**Fix.** Parse as a local calendar date. Add to `shared/upload-kinds.ts` (or a new `shared/dates.ts`):

```ts
/** "2026-09-11" -> a Date at local midnight, so calendar dates don't shift with the timezone. */
export function localDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d);
}
```

Use it everywhere a `documentDate` or `dateRecorded` string is turned into a `Date` for display (`grep -rn "new Date(.*documentDate\|new Date(.*dateRecorded" client/src`).

**Test first.** `shared/upload-kinds.test.ts` (or `shared/dates.test.ts`): `localDate("2026-09-11")` has `getFullYear() === 2026`, `getMonth() === 8`, `getDate() === 11` — regardless of `TZ`. Run the test once with `TZ=America/Los_Angeles pnpm vitest run <file>` to prove the old code would fail.

## 2. Oversize upload answers 500 instead of 413

**Symptom.** Uploading a 92 MB file returns `HTTP 500 {"message":"File too large"}`.

**Cause.** Multer's `limits.fileSize` throws a `MulterError` with `code === "LIMIT_FILE_SIZE"` before the route handler runs. It reaches the generic error middleware in `server/app.ts`, which has no status on the error and defaults to 500.

**Fix.** In `server/routes.ts`, wrap the `uploadFiles` middleware so Multer errors become client errors:

```ts
function uploadFilesOrReject(req, res, next) {
  uploadFiles(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({ message: err.code === "LIMIT_FILE_SIZE" ? `File too large. Maximum is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB per file.` : err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
  });
}
```

and use it on `POST /api/documents` and `POST /api/documents/:id/files`. `LIMIT_UNEXPECTED_FILE` (more than 50 `files`) is a 400.

**Test first.** There is no HTTP-level test harness yet; add `server/routes.test.ts` using `supertest` against `createApp()` from `server/app.ts` with a `MemoryObjectStore` (see how `server/document-files.test.ts` builds one). The test posts a `Buffer.alloc(MAX_UPLOAD_BYTES + 1)` as `files` with a logged-in session stubbed via `isAuthenticated` — if stubbing auth is awkward, test `uploadFilesOrReject` directly with a fake `uploadFiles` that calls back with `new multer.MulterError("LIMIT_FILE_SIZE")` and assert `res.status` was called with 413.

Also make the upload dialog show the server message for 413 instead of the generic "Failed to upload document" (`client/src/components/upload-dialog.tsx`, `onError`).

## 3. Viewer chrome for single-image records

**Symptom.** Opening a one-file record shows "Slice 1 / 1", a disabled range slider, and the sentence about the mouse wheel and arrow keys.

**Fix.** In `client/src/components/dicom-series-viewer.tsx`: when `count === 1`, hide the slice label, slider, and progress bar, and change the `DialogDescription` to "Single image." Keep the window-preset picker. Keep `data-testid="dicom-slice-index"` present but hidden (`hidden` attribute) so the e2e spec still finds it — or update `e2e/viewer-app.spec.ts`, which already tolerates a disabled slider.

**Test.** Playwright `e2e/viewer-app.spec.ts` uploads two fixtures as one series; add a second upload of a single fixture and assert the slider is not visible.

## Verify

```
pnpm test && pnpm check
E2E_BASE_URL=http://localhost:3002 pnpm test:e2e
```
