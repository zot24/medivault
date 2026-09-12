# Plan 03 — Overlay planes

Draw DICOM overlay planes (group `60xx`) on top of the image so measurement snapshots show the lines and regions the reader drew.

## Why

Every measurement snapshot in the reference case stores its distance line / ROI as an overlay plane (`(6000,0010)` rows, `(6000,0011)` columns, `(6000,0040)` type `G`, `(6000,0050)` origin, `(6000,0100)` bits allocated 1, `(6000,3000)` data), with `BurnedInAnnotation = NO`. The viewer ignores the plane, so the snapshot shows anatomy without the measurement.

## Format

Overlay data is a 1-bit bitmap, packed little-endian bit order (bit 0 of byte 0 is the first pixel), row-major, `rows × columns` pixels, padded to a byte boundary at the end (not per row). `OverlayOrigin` is a pair `[row, column]`, 1-based, of the image pixel where the overlay's top-left sits (usually `1\1`). Up to 16 planes at groups `0x6000, 0x6002, …, 0x601E`. Type `G` = graphics, `R` = ROI (draw both the same way).

## What to build

In `shared/dicom-frame.ts`:

```ts
export type DicomOverlay = { rows: number; columns: number; originRow: number; originColumn: number; bits: Uint8Array /* one byte per pixel, 0|1 */ };
export function overlaysFromPart10(bytes: Uint8Array): DicomOverlay[];   // [] when none
export function compositeOverlays(rgba: Uint8ClampedArray, frameRows: number, frameColumns: number, overlays: DicomOverlay[], color?: [number, number, number]): void; // mutates rgba
```

`dicom-parser` exposes elements by hex tag string: `dataSet.elements.x60003000`, `dataSet.uint16("x60000010")`, `dataSet.string("x60000050")` (a `\`-separated pair). Iterate groups `0x6000..0x601e` step 2. Default colour: `[0, 255, 128]` (mint), alpha 1.

Viewer (`client/src/components/dicom-series-viewer.tsx`): `pixelFrameFromPart10` stays as is; add `overlays` to the per-position cache alongside the frame (call `overlaysFromPart10` on the same bytes). In `blitFrame`, after `rgbaFromFrame`, call `compositeOverlays` when overlays exist and a new `showOverlays` state is true. Add a checkbox "Measurements" next to the window preset, visible only when the current frame has overlays; default on. `data-testid="dicom-overlay-toggle"`.

## Tests first

Extend `buildMiniCtDicom` in `shared/mini-ct-dicom.ts` with `overlay?: { rows; columns; originRow?; originColumn?; pixels: Uint8Array /* 0|1 */ }` that emits the six overlay elements (VR: `US` for rows/columns/bits allocated/bit position, `CS` for type, `SS` for origin, `OB`/`OW` for data). Pack bits LSB-first.

`shared/dicom-frame.test.ts`:
- `overlaysFromPart10` on a plain fixture → `[]`.
- Fixture with a 4×4 overlay whose pixel (1,2) is set → one overlay with `bits[1*4+2] === 1` and all others 0. Include a case with 9 columns to cover row lengths not a multiple of 8 (bits continue across rows without padding).
- `compositeOverlays` sets the RGBA of that pixel to the colour and leaves neighbours untouched; an origin of `[2, 3]` shifts by one row and two columns.

e2e: `e2e/dicom-canvas.spec.ts` harness — add an overlay fixture to `shared/fixtures/` generated from the builder (commit the generated `.dcm`, it is synthetic) and assert the overlay pixel is mint after drawing.

## Out of scope

Overlay planes embedded in unused high bits of pixel data (old-style), `OverlayLabel`, per-plane toggles, editing.

## Verify

`pnpm test && pnpm check && pnpm test:e2e`. In the app, open a measurement snapshot from the reference study: a line or region should be visible over the vessel; the toggle hides it.
