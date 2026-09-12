# Plan 06 — Ultrasound cine loops

Draw and play the echocardiogram: JPEG Baseline multi-frame ultrasound, decoded by the browser itself.

Depends on plan 02 (`dicomMeta`, `numberOfFrames`) and plan 04 (frame cache, phase/cine controls can be reused).

## Why

Study B is 56 files: 45 cine loops (up to 96 frames each) and 11 stills, 708×1016, `YBR_FULL_422`, transfer syntax JPEG Baseline `1.2.840.10008.1.2.4.50`. `pixelFrameFromPart10` returns null for it. Verified on the reference case: every frame is one encapsulated fragment that starts with `FF D8` (a complete JPEG), and `createImageBitmap(new Blob([fragment], { type: "image/jpeg" }))` decodes one in about 4 ms at full size. No new decoder dependency is needed.

## Format

Encapsulated pixel data: `(7FE0,0010)` with undefined length, a Basic Offset Table item, then one item per frame. `dicom-parser` gives `dicomParser.readEncapsulatedImageFrame(dataSet, dataSet.elements.x7fe00010, frameIndex)` → `Uint8Array` of that frame's fragment(s). `NumberOfFrames (0028,0008)` is a string. Cine rate is `CineRate (0018,0040)` fps, or `1000 / FrameTime (0018,1063)`; still images have neither. Calibration for measurements is in `SequenceOfUltrasoundRegions (0018,6011)` — out of scope but worth noting in the doc.

The browser's JPEG decoder handles the YBR→RGB conversion (a JFIF baseline stream is YCbCr by definition), so treat the output as RGB. Do not convert colour yourself.

## What to build

### A. Multi-frame in the decoder layer

`shared/dicom-frame.ts`:

```ts
export type EncapsulatedJpegSource = { kind: "jpeg-frames"; rows; columns; frameCount: number; frameRate: number | null; frame(index: number): Uint8Array };
export function multiFrameSourceFromPart10(bytes: Uint8Array): EncapsulatedJpegSource | null;  // only for 1.2.840.10008.1.2.4.50 (and .51) with SamplesPerPixel 3 or 1
```

Keep `pixelFrameFromPart10` for single-frame CT/SC. Unit tests need a fixture: extend `shared/mini-ct-dicom.ts` with `buildMiniUsCine({ frames: Uint8Array[] /* JPEG bytes */, rows, columns, frameRate })` that writes the encapsulated structure (BOT item + one item per frame, each even-padded). For test JPEG bytes, keep a tiny 8×8 baseline JPEG as a byte array constant in the test (generated once with any tool; a few hundred bytes; synthetic). Tests: frame count, `frame(0)` starts with `FF D8`, `frame(1)` differs from `frame(0)`, frame rate from `CineRate` and from `FrameTime`.

### B. Frame-addressable viewer source

The viewer currently identifies a frame by file *position*. Generalise: a viewer *frame key* is `{ position, frame }`. For CT series `frame` is always 0; for a cine record with one file, positions is 1 and `frame` runs 0..N-1. `GET /api/documents/:id/files` gains `numberOfFrames` per file (store it in `document_files` from `readFileMeta`, plan 04; if absent read it client-side after the first fetch).

Rasterisation: for `jpeg-frames` sources, `createImageBitmap` the fragment and `drawImage` it to the canvas (no `rgbaFromFrame`); cache the `ImageBitmap` in the frame cache (cost `rows*columns*4`; call `bitmap.close()` on eviction).

### C. Playback

When the current file is multi-frame with a frame rate: a play/pause button (`data-testid="dicom-play"`), space bar toggles, `requestAnimationFrame` loop advancing by elapsed time × frame rate, looping. Slider scrubs frames; arrow keys step frames. Preload the whole loop before playing (≤ 96 frames × ~100 KB is fine); show "Loading n / N" until then. The window-preset picker is hidden for RGB (already the case).

Stills (11 files, `Ultrasound Image Storage`, single frame) open as single images (plan 01 chrome).

### D. Study page

Plan 02's grouping: `modality === "US"` records go under *Images*; label "Echo cine loop, 2.1 s" (frames / rate) or "Echo still image". Thumbnail = frame 0 via `createImageBitmap`.

## Tests first

`shared/dicom-frame.test.ts` for A; `client/src/lib/frame-cache.test.ts` for bitmap cost/close; e2e harness: add a synthetic 2-frame cine fixture to `shared/fixtures/` and assert the canvas is non-blank and that pressing play changes the frame label.

## Out of scope

Doppler/colour flow specifics (they are just RGB frames), calibration/measurement, audio, lossless US.

## Verify

Upload the echo folder (56 files as one record — they are one series on the disc — or one record per file; either works, one record is the disc's truth). Open a loop: it plays at its native rate; scrub; stills open as single images.
