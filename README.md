# MediVault

MediVault is a patient-controlled health history. You store documents and symptoms in one place you own. The record does not live in a hospital system you cannot take with you.

## What is on main

`main` includes:

- Durable files in Supabase Storage. The API serves a download only after it checks that the signed-in user owns the file.
- Expiring share links at `/s/:token`. Each link lasts 1h, 24h, or 7d. You can revoke a link.
- Case bundles that put more than one file in one share packet.
- A DICOM viewer. `dicom-parser` plus `jpeg-lossless-decoder-js` draw 16-bit CT Image Storage (`1.2.840.10008.5.1.4.1.1.2`, MONOCHROME2) and 8-bit Secondary Capture RGB (`1.2.840.10008.5.1.4.1.1.7`) on a canvas. Transfer syntaxes are uncompressed, JPEG Lossless (`1.2.840.10008.1.2.4.70` and `1.2.840.10008.1.2.4.57`), and RLE (`1.2.840.10008.1.2.5`).

## Stack

The web app is Vite and React. The API is Express. Postgres is Neon through Drizzle. File bytes live in Supabase Storage. `@medivault/sdk` is the TypeScript client. `packages/mobile` is an Expo app.

## Run it locally

1. Install dependencies.

```bash
pnpm install
```

2. Build the SDK. `@medivault/sdk` resolves to `packages/sdk/dist`, so this step is required.

```bash
pnpm build:sdk
```

3. Start local Supabase. Copy values from `supabase status` into `.env`.

```bash
supabase start
```

Set these variables in `.env`:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=medical-files`

4. Push the schema and load the demo user.

```bash
pnpm db:push
pnpm db:seed
```

5. Start the app. Port 3000 is often taken, so use 3002.

```bash
PORT=3002 pnpm dev
```

6. Sign in with email `demo@medivault.app` and password `demo123`.

## Test share links

Open Documents. Use **Share** or **Share case**. Copy the `/s/:token` path. Open that path.

## Test DICOM

Upload `.dcm` files, or extensionless Part-10 slices from a patient CD (`DICM` at byte 128). A multi-select of DICOM slices becomes one series: one document record with one file per slice (`document_files`), sent in chunks of 50 (`POST /api/documents`, then `POST /api/documents/:id/files`). Documents shows the series as one card with a slice count. Open the card: the viewer lists `GET /api/documents/:id/files`, draws the first slice as soon as it arrives and fills the rest in the background, nearest slices first. CT images are windowed in Hounsfield units with presets (CT angio, soft tissue, lung, bone).

Clinical CT CD data is expected to work after a `.dcm` rename or as extensionless Part-10 files. JPEG Lossless (`1.2.840.10008.1.2.4.70`) and RLE (`1.2.840.10008.1.2.5`) draw in the canvas viewer.

Two objects on those CDs often share a CT-like file name. CT Image Storage (`SOP 1.2.840.10008.5.1.4.1.1.2`) is 16-bit greyscale. Secondary Capture (`SOP 1.2.840.10008.5.1.4.1.1.7`) is often 8-bit RGB RLE, a screenshot or recon panel. Both draw. A file that still cannot draw shows SOP class, photometric interpretation, and bits allocated. It does not show patient tags.

This is not a PACS. JPEG 2000, JPEG-LS, and other transfer syntaxes still do not draw. Each file must be 50MB or smaller.

## Uploading a study from a hospital CD

A patient CD usually holds several studies, a bundled viewer, and an index. Only the image series are worth uploading.

**What is on the disc**

- `DICOMDIR`, `Studies_List.txt`, `Autorun.inf` — index files. Skip them.
- `*.exe`, `*.dmg`, `viewers/`, `weasis/` — the viewer programs the hospital bundles. Skip them.
- Folders like `ST000001/SE000007` (or `DICOM/…`) — one `ST` folder per study, one `SE` folder per series. Files inside often have no extension (`CT000001`, `XA000001`). **These are the images.**

**What to pick**

- Upload **one `SE` folder at a time**: select every file in it. The app stores it as one document with one file per slice and shows it as one card.
- For a CT, start with the thin-slice axial series (the folder with the most files, around 0.5–1 mm slices). Thick 3 mm reconstructions, MPR snapshots, and dose sheets are also fine, one series each.
- A 4D or multi-phase series (thousands of files) works but is slow to upload and view; take the single best-phase series first.

**What will not draw yet**

- Structured reports (`SR`): no pixels. They upload as opaque files.
- Ultrasound cine (`US`, JPEG Baseline) and angiography runs (`XA`, multi-frame, often over 50 MB per file): not supported by the decoder or over the size cap.

**Size and time**

A thin-slice CT series is typically 500–1,000 files and 100–300 MB. The browser sends it in batches of 50 slices; the dialog shows progress and warns above 100 MB. Stay on the page until it finishes. If it is interrupted, delete the partial card and upload the folder again.

**Privacy**

DICOM headers carry the patient name, birth date, and hospital IDs. They are stored with the file, only readable by the owning account, and never shown by the viewer or logged. Do not commit real patient files to this repository; the fixtures under `shared/fixtures/` are synthetic.

The synthetic fixtures in `shared/fixtures/` do render. They contain no patient data.

## Test

```bash
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm test:e2e` starts a local harness, draws the synthetic fixtures on a canvas, and asserts non-blank pixels. It does not need a database. Chromium is enough. The login and upload spec is skipped unless `E2E_BASE_URL` is set.

To run the login and upload flow against a local app, start Supabase, seed the demo user, then run the app and the app spec.

```bash
PORT=3002 pnpm dev
E2E_BASE_URL=http://localhost:3002 pnpm test:e2e
```

Sign in with `demo@medivault.app` / `demo123`. The app spec uploads `shared/fixtures/mini-sc-rgb.dcm` and `shared/fixtures/mini-ct-01.dcm`, opens the viewer, and checks the canvas.

## Mobile

The Expo app lives in `packages/mobile`. Set `EXPO_PUBLIC_API_URL` to the API on your LAN, for example `http://192.168.x.x:3002`. Then run `pnpm dev:mobile` or `expo start`.

Share links and the DICOM viewer are web-first. The mobile app has login, documents, and symptoms. It does not have share links or the DICOM viewer.

## Backlog

Open work lives in [GitHub Issues](https://github.com/zot24/medivault/issues). Issues 6 through 17 are the current backlog.
