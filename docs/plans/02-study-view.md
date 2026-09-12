# Plan 02 — Series metadata and study view

The foundation for all imaging UX. After this, a CT study is one entry that opens to its series, instead of 32 peer cards among lab results.

## Why

With the reference case loaded, Documents shows 32 cards titled with scanner protocol strings (`DS_CorCTA 0.75 Bv40 3 10 - 100 %`), all badged "X Ray", three of them named "Report Data", with no way to tell which is the diagnostic volume. See [reference-case.md](../reference-case.md), "What MediVault can show today".

## What to build

### A. Extract DICOM series metadata at upload (server)

New module `shared/dicom-meta.ts`, header-only, using `dicom-parser` (already a dependency; see how `shared/dicom-frame.ts` calls `dicomParser.parseDicom`):

```ts
export type DicomSeriesMeta = {
  studyInstanceUid: string;      // (0020,000D)
  seriesInstanceUid: string;     // (0020,000E)
  sopClassUid: string;           // (0008,0016)
  modality: string;              // (0008,0060) CT, US, XA, SR, ...
  studyDescription: string;      // (0008,1030)
  seriesDescription: string;     // (0008,103E)
  seriesNumber: number | null;   // (0020,0011)
  rows: number | null; columns: number | null;
  numberOfFrames: number;        // (0028,0008), default 1
  photometric: string;           // (0028,0004)
  transferSyntaxUid: string;     // (0002,0010)
  sliceThickness: number | null; // (0018,0050)
  imageType: string[];           // (0008,0008) split on backslash
  hasOverlay: boolean;           // any (60xx,3000) present
};
export function readSeriesMeta(bytes: Uint8Array): DicomSeriesMeta | null;
export function seriesLabel(meta: DicomSeriesMeta): string;   // human label, see C
export function seriesGroup(meta: DicomSeriesMeta): "volume" | "snapshot" | "analysis" | "report" | "localizer" | "other";
```

**Do not read** PatientName, PatientID, PatientBirthDate, AccessionNumber, InstitutionName, referring/performing physician, or any date tag. The meta object must never contain them — write a test that asserts the returned object's keys are exactly the list above.

Schema: add `dicomMeta: jsonb("dicom_meta").$type<DicomSeriesMeta | null>()` to `medicalDocuments` in `shared/schema.ts`. `pnpm db:push` locally.

Service: in `server/document-files.ts` `uploadOwnedDocument`, when the first classified file is `application/dicom`, call `readSeriesMeta(first.bytes)` and store it on the record. Appending files does not change it. Expose it in `MedicalDocument` (SDK `packages/sdk/src/types.ts` gains `dicomMeta`).

### B. Study grouping (API)

`GET /api/studies` → records grouped by `dicomMeta.studyInstanceUid`:

```ts
type StudySummary = {
  studyInstanceUid: string;
  modalities: string[];              // distinct, e.g. ["CT","SR"]
  studyDescription: string;          // most common non-empty
  documentDate: string;              // earliest record date
  seriesCount: number; fileCount: number; totalBytes: number;
  primary: MedicalDocument | null;   // see D
  groups: Record<SeriesGroup, MedicalDocument[]>;
};
```

Records without `dicomMeta` are not studies and are not returned here. Implement grouping as a pure function `groupIntoStudies(records)` in `shared/studies.ts` with unit tests; the route is a thin wrapper.

### C. Human labels

`seriesLabel(meta)` turns protocol strings into something a patient can read. Rules, in order:

1. `modality === "SR"` → `"Report — " + seriesDescription` (or "Report").
2. `imageType` includes `LOCALIZER` → "Scout image".
3. `imageType` includes `SECONDARY` and `numberOfFrames === 1` and `photometric` is mono → "Measurement snapshot" (append the phase if the description contains `\d+ ?%`: "Measurement snapshot, 77 % phase").
4. `imageType` includes `SECONDARY` and rgb → "Analysis charts".
5. `modality === "CT"` and `sliceThickness` present: `"CT volume, {thickness} mm"` plus `", best diastole"` / `", best systole"` when the description contains `BestDiast` / `BestSyst`, plus `", multi-phase"` when it matches `\d+ - \d+ ?%`.
6. `modality === "US"` → `numberOfFrames > 1 ? "Echo cine loop" : "Echo still image"`.
7. `modality === "XA"` → "Angiography run".
8. Otherwise the raw description, or the modality.

Keep the raw `seriesDescription` visible as secondary text. `seriesGroup` follows the same tests: localizer / snapshot / analysis / report / volume / other.

Table-driven test: one row per rule with a meta fixture built by a helper.

### D. Primary series

`primarySeries(records)` in `shared/studies.ts`: among `volume` records, the one with the most files among those whose label contains "best diastole"; else the most files overall; else null. This is what the study card opens by default.

### E. UI

- `client/src/pages/documents.tsx`: records with `dicomMeta` are collapsed into **study cards** (one per study) rendered before the ordinary documents. Ordinary documents are unchanged.
- New `client/src/components/study-card.tsx`: modality badge (CT / US / XA), study description or "Imaging study", date, "N series · M images · size", a **thumbnail** (see F), and a "Open study" button.
- New `client/src/pages/study.tsx` at `/studies/:studyInstanceUid`: header as the card, then sections in this order — *Images* (volumes, primary first, each with thumbnail, label, slice count, "View"), *Measurements* (snapshots as a thumbnail grid), *Analysis*, *Reports*, *Other*. "View" opens the existing `DicomSeriesViewer` for that record.
- Type badge: for records with `dicomMeta`, show the modality instead of the `documentType` label. Do not change the `documentType` enum in this plan.
- Stats tiles on Documents: count studies as one item each.

Wouter is the router (`client/src/App.tsx`); follow how `/shared/:token` is registered.

### F. Thumbnails

Client-side, lazy, cached: `client/src/lib/thumbnails.ts` exports `useThumbnail(documentId, position = 0)` which fetches `/api/documents/:id/files/0`, decodes with `pixelFrameFromPart10`, draws to an offscreen 128 px canvas with the stored window, and returns a data URL; cache in a module-level `Map` keyed by document id and in `sessionStorage`. For the multi-phase CT volume choose position `Math.floor(fileCount / 2)` (mid-chest), not 0. Non-drawable (SR) shows a document icon. Server-side thumbnails are out of scope.

## Tests first

- `shared/dicom-meta.test.ts`: reads meta from `buildMiniCtDicom()` (extend the fixture builder with `studyInstanceUid`, `seriesInstanceUid`, `modality`, `seriesDescription`, `imageType`, `sliceThickness` options); key-list assertion (no identifiers); `hasOverlay` true when the fixture has an overlay (plan 03 adds the option — if not there yet, assert false and leave a TODO).
- `shared/studies.test.ts`: `groupIntoStudies`, `seriesLabel` table, `primarySeries`.
- `server/document-files.test.ts`: uploading a DICOM series stores `dicomMeta`; uploading a PDF stores `null`.
- e2e: extend `e2e/viewer-app.spec.ts` — after uploading the two fixtures, a study card exists and opens to a page listing one series.

## Out of scope

Overlay drawing (03), phase handling (04), SR content (05), server thumbnails, editing labels.

## Verify

`pnpm test && pnpm check`; `pnpm db:push` on local Supabase; `pnpm test:e2e` with `E2E_BASE_URL`; open the app and confirm the reference study appears as one card whose page lists the primary volume first.
