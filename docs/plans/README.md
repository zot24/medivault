# Imaging plans

Execution plans for the DICOM work that the [reference case](../reference-case.md) exposed. Each plan is self-contained: what to build, which files, tests first, how to verify. They are written so a smaller model can execute one without the conversation that produced it.

Ground rules for every plan:

- Test-first. Write the failing unit test, then the code. `pnpm test` and `pnpm check` (tsc) must pass before and after.
- Fixtures are synthetic. Extend `shared/mini-ct-dicom.ts` to produce what the test needs; never add real patient files.
- Nothing from the local test data — names, dates, IDs, paths under `~/Desktop` — goes into code, tests, docs, or commit messages. Slice counts and scanner protocol strings are fine.
- One plan, one branch, one PR. Commit messages: what changed and why, imperative mood.
- Verify in the running app when the plan says so: `PORT=3002 pnpm dev` with the local Supabase, then the Playwright specs (`pnpm test:e2e`, with `E2E_BASE_URL=http://localhost:3002` for the app spec).

## Order and dependencies

| # | Plan | Depends on | Size | Unlocks |
|---|---|---|---|---|
| 1 | [Small fixes](01-small-fixes.md) | — | S | Clean baseline: date off-by-one, 413 for oversize, viewer chrome for single images |
| 2 | [Series metadata and study view](02-study-view.md) | — | L | Everything below; the flat list stops being a worklist |
| 3 | [Overlay planes](03-overlay-planes.md) | — | S | The 17 measurement snapshots show their measurements |
| 4 | [Multi-phase series and frame cache](04-multiphase-and-cache.md) | 2 (metadata) | M | The 5,800-slice 4D series becomes usable |
| 5 | [Structured report summary](05-structured-reports.md) | 2 (metadata) | M | The CT Coronary findings render as a lesion table |
| 6 | [Ultrasound cine](06-ultrasound-cine.md) | 2 (metadata), 4 (frame cache) | M | Study B draws and plays |
| 7 | [Angiography runs over 50 MB](07-angiography-range.md) | 6 (multi-frame viewer) | M | Study C uploads and plays |

1 and 3 can run in parallel with 2. Do 2 before 4–7.

## Shared vocabulary

- **Record**: one `medical_documents` row. A DICOM series is one record with N rows in `document_files` (one per slice or per multi-frame file).
- **Frame**: one 2-D image. A CT slice file holds one frame; an ultrasound cine or an angiography run holds many in a single file (`NumberOfFrames`).
- **Study**: everything from one acquisition, identified by `StudyInstanceUID`. Records don't know their study yet — plan 2 adds that.
- **Decoder**: `shared/dicom-frame.ts` — `pixelFrameFromPart10(bytes)` returns a `DicomFrame` (`mono16` or `rgb8`) or `null`; `rgbaFromFrame(frame, window?)` rasterises it. Runs in the browser and in Node.
- **Viewer**: `client/src/components/dicom-series-viewer.tsx` — lists `GET /api/documents/:id/files`, streams `GET /api/documents/:id/files/:position` nearest-first, draws to a canvas.
