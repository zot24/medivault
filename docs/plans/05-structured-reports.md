# Plan 05 — Structured report summary

Render the findings of a DICOM Structured Report (SR) as a readable summary, and stop showing "cannot draw" for SR records.

Depends on plan 02 (`dicomMeta.modality === "SR"`, study page).

## Why

The reference study carries five SR series. Three "Radiology Report" Basic Text SRs are empty (no content items — the written report is not on the disc). Two Comprehensive SRs are mostly vendor-private blobs. One, "CT Coronary", has a real content tree: per-lesion `TEXT` identifiers, `NUM` path lengths in cm, and `IMAGE` references to the measurement snapshots. That is worth rendering; the rest should degrade to "No readable content".

## Format

An SR is a tree of content items in `ContentSequence (0040,A730)`. Each item has `ValueType (0040,A040)` — `CONTAINER`, `TEXT`, `NUM`, `CODE`, `IMAGE`, `DATE`, … — a `ConceptNameCodeSequence (0040,A043)` whose first item's `CodeMeaning (0008,0104)` is the human label, and a value: `TextValue (0040,A160)`; for `NUM`, `MeasuredValueSequence (0040,A300)` → `NumericValue (0040,A30A)` and `MeasurementUnitsCodeSequence (0040,08EA)` → `CodeValue (0008,0100)`; for `CODE`, `ConceptCodeSequence (0040,A168)` → `CodeMeaning`; for `IMAGE`, `ReferencedSOPSequence (0008,1199)` → `ReferencedSOPInstanceUID (0008,1155)`. Containers nest via their own `ContentSequence`. `dicom-parser` parses sequences into `element.items[].dataSet`.

## What to build

`shared/dicom-sr.ts`:

```ts
export type SrNode = { type: string; name: string; text?: string; value?: number; unit?: string; code?: string; imageRef?: string; children: SrNode[] };
export function parseSr(bytes: Uint8Array): { title: string; nodes: SrNode[] } | null;   // null when not an SR SOP class (1.2.840.10008.5.1.4.1.1.88.*)
export function flattenMeasurements(nodes: SrNode[]): { path: string[]; name: string; value: number; unit: string; imageRef?: string }[];
```

Do not read patient, physician, institution, or date tags; the parser only walks `ContentSequence`. Do not decode private tags.

UI: `client/src/components/sr-report-view.tsx`, opened by "View" on an SR record instead of the canvas viewer (branch on `dicomMeta.modality === "SR"` in `document-card.tsx` and the study page). Layout: title; a **measurements table** (path as breadcrumb, name, value with unit); below it the raw tree collapsed by default. Empty tree → "This report has no readable content." `IMAGE` references become links when a sibling record in the same study has a file with that SOP instance UID — this needs `sopInstanceUid` per file: add it to `document_files` metadata in the same PR (read `(0008,0018)` in `readFileMeta` from plan 04; if plan 04 is not merged yet, add just that column here).

Server: `GET /api/documents/:id/files/:position` already streams the bytes; the client parses. No new endpoints.

## Tests first

Extend the fixture builder with `buildMiniSr({ title, nodes })` that writes a Comprehensive SR with nested `ContentSequence` items (explicit VR little-endian; sequences with defined lengths are easiest). `shared/dicom-sr.test.ts`: nested container → flattened path; `NUM` with unit; `IMAGE` ref; a non-SR CT fixture → `null`; an SR with no content → `nodes: []`.

## Out of scope

Rendering vendor-private content, PDF export, SR editing, Basic Text SR "Radiology Report" beyond showing its (empty) text.

## Verify

Open the CT Coronary report from the reference study: a table with lesion identifiers and lengths in cm; the empty Report Data records show the "no readable content" message rather than a decoder error.
