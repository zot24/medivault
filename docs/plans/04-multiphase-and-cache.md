# Plan 04 — Multi-phase series and a bounded frame cache

Make the 5,800-slice cardiac-cycle series usable: detect its 10 phases × 580 positions, add a phase selector, and stop holding every decoded slice in memory.

Depends on plan 02 (`dicomMeta`, per-file metadata is added here).

## Why

Opening the multi-phase volume works (first slice in 3 s) but the slider runs 1→5,800 through the same anatomy ten times, and the JS heap grows ~0.5 MB per slice to ~3 GB of a 4 GB tab limit. Closing the viewer does not release memory promptly. Measured on the reference case.

## What to build

### A. Per-file position metadata (server)

Extend `document_files` (`shared/schema.ts`) with nullable `instanceNumber: integer` (`(0020,0013)`), `sliceLocation: real` (third value of `ImagePositionPatient (0020,0032)`, else `SliceLocation (0020,1041)`), and `phase: real` (`NominalPercentageOfCardiacPhase (0020,9241)` if present, else `TriggerTime (0018,1060)` in ms, else null). The reference scanner writes neither phase tag on the multi-phase series, so detection must work from slice locations alone (B).

`readFileMeta(bytes)` in `shared/dicom-meta.ts` returns `{ instanceNumber, sliceLocation, phase }` using only those tags. `uploadOwnedDocument` and `appendOwnedFiles` store them per file. `GET /api/documents/:id/files` returns them.

### B. Phase detection (pure, shared)

`shared/phases.ts`: `detectPhases(files: { position; sliceLocation; phase }[]) → { phases: { key: string; label: string; positions: number[] }[] } | null`.

- If `phase` values are present with ≥2 distinct values, group by phase; label `"{n} %"` or `"{n} ms"`.
- Else, if `sliceLocation` values repeat: count distinct locations `L`; if `files.length % L === 0` and `files.length / L ≥ 2`, split into `files.length / L` consecutive runs of `L` (files are in upload order; the upload dialog and CD folders are instance-number order, which for these series is phase-major). Label phases `"Phase 1..k"`.
- Else null (a plain volume).

Within a phase, order positions by `sliceLocation` descending (head first), falling back to `instanceNumber`.

Tests: 10 × 3 synthetic entries with repeating locations → 10 phases of 3, each sorted; distinct locations → null; explicit phase tags win over location repetition.

### C. Bounded cache (viewer)

Replace `framesRef: Map<number, DicomFrame>` with an LRU: `client/src/lib/frame-cache.ts`, `class FrameCache { constructor(maxBytes) get(pos) set(pos, frame) has(pos) clear() }` where a frame's cost is `rows*columns*(kind==="mono16"?2:3)`. Default budget 512 MB. Eviction: least recently *drawn or loaded*; never evict the current position or its ±8 neighbours. The background loaders stop when the cache is full and resume on scroll (they already re-pick nearest-first; add a `wanted(pos)` check: only load positions within the current phase and within budget distance).

On close: `cache.clear()` and cancel in-flight fetches with an `AbortController`.

Test: cache with a 3-frame budget evicts the oldest untouched frame; pinning the current index protects it.

### D. Phase UI

When `detectPhases` returns phases: a segmented control or `<select>` above the slider ("Phase: 10 % … 100 %"), `data-testid="dicom-phase-select"`. The slider then ranges over that phase's positions only; the label reads "Slice 12 / 580 · Phase 70 %". Space bar toggles **cine through phases** at the current slice (advance phase every 100 ms) — this is how cardiologists look at wall motion. Loading order: current phase first.

## Tests first

`shared/dicom-meta.test.ts` (file meta), `shared/phases.test.ts`, `client/src/lib/frame-cache.test.ts` (vitest, no DOM). The viewer itself is covered by e2e: extend the harness fixture set with a 2-phase × 2-slice synthetic series and assert the phase select appears.

## Out of scope

Server-side downsampling, WebGL, MPR.

## Verify

Open the multi-phase volume from the reference study: phase select shows 10 entries, the slider spans 580, the heap stays under ~700 MB after scrolling the whole phase (check `performance.memory.usedJSHeapSize` in the console), and closing the dialog returns memory within a few seconds.
