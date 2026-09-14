import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoWindow,
  compositeOverlays,
  describeUndrawableFrame,
  isMostlyBlackAtStoredWindow,
  multiFrameSourceFromPart10,
  overlaysFromPart10,
  pixelFrameFromPart10,
  renderFrameRgba,
  rgbaFromFrame,
  windowForPreset,
  type DicomMono16Frame,
} from "./dicom-frame";
import {
  SOP_CT_IMAGE,
  SOP_SECONDARY_CAPTURE,
  TRANSFER_EXPLICIT_LE,
  TRANSFER_JPEG_LOSSLESS,
  TRANSFER_RLE,
  buildMiniCtDicom,
  buildMiniScRgbDicom,
  buildMiniUsCine,
} from "./mini-ct-dicom";

// A tiny 8x8 baseline (SOF0) grayscale JPEG, generated once with a
// hand-rolled encoder (standard Annex K Huffman tables, one DC-only block)
// and verified to decode in a real browser via createImageBitmap. Synthetic,
// ~300 bytes. FRAME_B differs from FRAME_A only in its DC coefficient (a
// solid gray 128 vs 130), so the two are byte-for-byte distinguishable.
const FRAME_A = new Uint8Array([
  0xff, 0xd8, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
  0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
  0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
  0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x10,
  0x10, 0x10, 0x10, 0x10, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x08, 0x00, 0x08, 0x01, 0x01, 0x11,
  0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09,
  0x0a, 0x0b, 0xff, 0xc4, 0x00, 0xb5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05,
  0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7d, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21,
  0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23,
  0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17,
  0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a,
  0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a,
  0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a,
  0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99,
  0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7,
  0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5,
  0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1,
  0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00,
  0x00, 0x3f, 0x00, 0x2b, 0xff, 0xd9,
]);

const FRAME_B = new Uint8Array(FRAME_A);
FRAME_B[FRAME_B.length - 3] = 0x5a; // the one byte that carries the DC coefficient

describe("pixelFrameFromPart10", () => {
  it("reads rows, columns, and the first pixel from a generated CT slice", () => {
    const pixels = new Uint16Array(16 * 16);
    pixels[0] = 42;
    pixels[1] = 99;
    const bytes = buildMiniCtDicom({
      rows: 16,
      columns: 16,
      instanceNumber: 2,
      pixels,
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame).toMatchObject({
      rows: 16,
      columns: 16,
      windowCenter: 500,
      windowWidth: 1000,
    });
    expect(frame?.pixels[0]).toBe(42);
    expect(frame?.pixels[1]).toBe(99);
  });

  it("rejects bytes that are not a Part 10 file", () => {
    expect(pixelFrameFromPart10(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("reads the committed mini-ct-01 fixture", () => {
    const bytes = readFileSync("shared/fixtures/mini-ct-01.dcm");
    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame?.rows).toBe(16);
    expect(frame?.columns).toBe(16);
    expect(frame?.pixels.length).toBe(256);
  });

  it("decodes a JPEG Lossless 1.2.4.70 slice back to the source pixels", () => {
    const pixels = new Uint16Array(16 * 16);
    pixels[0] = 42;
    pixels[1] = 99;
    pixels[17] = 700;
    const bytes = buildMiniCtDicom({
      rows: 16,
      columns: 16,
      pixels,
      transferSyntax: TRANSFER_JPEG_LOSSLESS,
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame).toMatchObject({ rows: 16, columns: 16 });
    expect(frame?.pixels[0]).toBe(42);
    expect(frame?.pixels[1]).toBe(99);
    expect(frame?.pixels[17]).toBe(700);
  });

  it("decodes an RLE 1.2.5 slice back to the source pixels", () => {
    const pixels = new Uint16Array(8 * 8);
    pixels[0] = 12;
    pixels[1] = 4000;
    const bytes = buildMiniCtDicom({
      rows: 8,
      columns: 8,
      pixels,
      transferSyntax: TRANSFER_RLE,
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame?.kind).toBe("mono16");
    expect(frame?.pixels[0]).toBe(12);
    expect(frame?.pixels[1]).toBe(4000);
  });

  it("decodes an RLE 8-bit RGB Secondary Capture frame", () => {
    const pixels = new Uint8Array(4 * 4 * 3);
    pixels[0] = 255;
    pixels[4] = 128;
    pixels[8] = 64;
    const bytes = buildMiniScRgbDicom({
      rows: 4,
      columns: 4,
      pixels,
      transferSyntax: TRANSFER_RLE,
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame).toMatchObject({ kind: "rgb8", rows: 4, columns: 4 });
    expect(frame?.pixels[0]).toBe(255);
    expect(frame?.pixels[1]).toBe(0);
    expect(frame?.pixels[2]).toBe(0);
    expect(frame?.pixels[3]).toBe(0);
    expect(frame?.pixels[4]).toBe(128);
    expect(frame?.pixels[5]).toBe(0);
    expect(frame?.pixels[6]).toBe(0);
    expect(frame?.pixels[7]).toBe(0);
    expect(frame?.pixels[8]).toBe(64);
  });

  it("decodes uncompressed 8-bit RGB Secondary Capture", () => {
    const pixels = new Uint8Array(2 * 2 * 3);
    pixels.set([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    const bytes = buildMiniScRgbDicom({
      rows: 2,
      columns: 2,
      pixels,
      transferSyntax: TRANSFER_EXPLICIT_LE,
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame?.kind).toBe("rgb8");
    expect(Array.from(frame?.pixels ?? [])).toEqual([
      9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    ]);
  });

  it("reads the committed mini-sc-rgb fixture", () => {
    const bytes = readFileSync("shared/fixtures/mini-sc-rgb.dcm");
    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame?.kind).toBe("rgb8");
    expect(frame?.rows).toBe(8);
    expect(frame?.columns).toBe(8);
    expect(frame?.pixels[0]).toBe(255);
    expect(frame?.pixels[4]).toBe(255);
    expect(frame?.pixels[8]).toBe(255);
    const rgba = rgbaFromFrame(frame!);
    expect(rgba[0]).toBe(255);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
    expect(rgba.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
  });

  it("names SOP, photometric, and bits when a file cannot be drawn", () => {
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
      photometric: "YBR_FULL",
      sopClass: SOP_SECONDARY_CAPTURE,
    });
    expect(pixelFrameFromPart10(new Uint8Array(bytes))).toBeNull();
    expect(describeUndrawableFrame(new Uint8Array(bytes))).toBe(
      `Cannot draw this file (SOP ${SOP_SECONDARY_CAPTURE}, photometric YBR_FULL, 8-bit, transfer ${TRANSFER_EXPLICIT_LE}).`,
    );
  });

  it("keeps CT Image Storage in the refusal text for 8-bit mono", () => {
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      bitsAllocated: 8,
    });
    expect(describeUndrawableFrame(new Uint8Array(bytes))).toContain(SOP_CT_IMAGE);
    expect(describeUndrawableFrame(new Uint8Array(bytes))).toContain("MONOCHROME2");
    expect(describeUndrawableFrame(new Uint8Array(bytes))).toContain("8-bit");
  });
});

describe("window and rescale", () => {
  it("takes the first value of a multi-valued WindowCenter/WindowWidth", () => {
    // Siemens SOMATOM writes two presets: "345\-600" and "1215\1300".
    const bytes = buildMiniCtDicom({
      windowCenter: "345\\-600",
      windowWidth: "1215\\1300",
    });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame).toMatchObject({ windowCenter: 345, windowWidth: 1215 });
  });

  it("carries RescaleIntercept and RescaleSlope on the frame", () => {
    const bytes = buildMiniCtDicom({ rescaleIntercept: -1024, rescaleSlope: 1 });

    const frame = pixelFrameFromPart10(new Uint8Array(bytes));
    expect(frame).toMatchObject({ rescaleIntercept: -1024, rescaleSlope: 1 });
  });

  it("defaults rescale to identity when the tags are absent", () => {
    const frame = pixelFrameFromPart10(new Uint8Array(buildMiniCtDicom()));
    expect(frame).toMatchObject({ rescaleIntercept: 0, rescaleSlope: 1 });
  });

  it("windows in rescaled (HU) units, not stored values", () => {
    // Stored 1024 with intercept -1024 is 0 HU: the centre of a 0/200 window -> mid grey.
    const pixels = new Uint16Array(16 * 16).fill(1024);
    const bytes = buildMiniCtDicom({
      pixels,
      rescaleIntercept: -1024,
      windowCenter: 0,
      windowWidth: 200,
    });

    const rgba = rgbaFromFrame(pixelFrameFromPart10(new Uint8Array(bytes))!);
    expect(rgba[0]).toBe(128);
  });

  it("lets the caller override the window with a preset", () => {
    const pixels = new Uint16Array(16 * 16).fill(1024 + 300);
    const bytes = buildMiniCtDicom({ pixels, rescaleIntercept: -1024 });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes))!;

    // 300 HU is the centre of the CT angio preset.
    const rgba = rgbaFromFrame(frame, { center: 300, width: 800 });
    expect(rgba[0]).toBe(128);
    // ...and far above a lung window.
    const lung = rgbaFromFrame(frame, { center: -600, width: 1500 });
    expect(lung[0]).toBe(255);
  });

  it("does not apply mono8's '-1' high-edge adjustment to mono16 (CT/MR) frames", () => {
    // mono8's window formula subtracts 1 from the high edge so a window
    // exactly spanning the 8-bit range doesn't clip 255 (see the mono8
    // describe block below) — that's specific to mono8; applying it to
    // mono16 would shift existing CT/MR windowing (out of plan 07's scope).
    const pixels = new Uint16Array(16 * 16).fill(4);
    const bytes = buildMiniCtDicom({ pixels, windowCenter: 0, windowWidth: 10 });

    const rgba = rgbaFromFrame(pixelFrameFromPart10(new Uint8Array(bytes))!);

    // No -1: low = -5, high = 5, span = 10 -> (4 - -5) / 10 * 255 = 229.5 -> 230.
    // With the mono8 adjustment wrongly applied: high = 4, span = 9 -> 255 (clipped).
    expect(rgba[0]).toBe(230);
  });
});

describe("rgbaFromFrame on mono8", () => {
  it("maps 0 -> 0 and 255 -> 255 under window 128/256 (plan 07 angiography frames)", () => {
    const frame = {
      kind: "mono8" as const,
      rows: 1,
      columns: 2,
      pixels: Uint8Array.from([0, 255]),
      windowCenter: 128,
      windowWidth: 256,
    };

    const rgba = rgbaFromFrame(frame);

    expect(rgba[0]).toBe(0);
    expect(rgba[1]).toBe(0);
    expect(rgba[2]).toBe(0);
    expect(rgba[3]).toBe(255);
    expect(rgba[4]).toBe(255);
    expect(rgba[5]).toBe(255);
    expect(rgba[6]).toBe(255);
    expect(rgba[7]).toBe(255);
  });

  it("applies no rescale (slope 1, intercept 0) — an override window is used directly", () => {
    const frame = {
      kind: "mono8" as const,
      rows: 1,
      columns: 1,
      pixels: Uint8Array.from([100]),
      windowCenter: 128,
      windowWidth: 256,
    };

    // window 100/20 -> low 90, high 109: (100-90)/19 * 255 ~= 134, ignoring
    // the frame's own stored window (128/256, which would give 100).
    const rgba = rgbaFromFrame(frame, { center: 100, width: 20 });
    expect(rgba[0]).toBe(134);
  });
});

describe("CT_WINDOW_PRESETS", () => {
  it("resolves a preset id to a window and 'stored' to undefined", () => {
    expect(windowForPreset("cta")).toEqual({ center: 300, width: 800 });
    expect(windowForPreset("stored")).toBeUndefined();
    expect(windowForPreset("nope")).toBeUndefined();
  });
});

describe("isMostlyBlackAtStoredWindow", () => {
  it("is false for a frame whose stored window covers its pixel range", () => {
    const frame = pixelFrameFromPart10(
      new Uint8Array(buildMiniCtDicom()),
    ) as DicomMono16Frame;
    expect(isMostlyBlackAtStoredWindow(frame)).toBe(false);
  });

  it("is true when the stored window sits far above the frame's actual pixel range", () => {
    // A dose-sheet/text page: real pixel values cluster in a narrow band,
    // but the file's own window preset (meant for a different series) is
    // centered well above it, so every pixel clamps to black.
    const pixels = Uint16Array.from({ length: 16 * 16 }, (_, i) => 800 + (i % 200));
    const bytes = buildMiniCtDicom({ pixels, windowCenter: 5000, windowWidth: 1000 });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes)) as DicomMono16Frame;
    expect(isMostlyBlackAtStoredWindow(frame)).toBe(true);
  });

  it("is false for a frame with zero dynamic range, even if its constant value sits below the stored window", () => {
    // A secondary-capture page whose content lives entirely in an overlay
    // plane (the CT dose sheet is one) has pixel data that is all zero.
    // Auto-windowing a constant image is meaningless, so this must not
    // read as "mostly black due to a mismatched preset".
    const pixels = new Uint16Array(16 * 16).fill(0);
    const bytes = buildMiniCtDicom({ pixels, windowCenter: 5000, windowWidth: 1000 });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes)) as DicomMono16Frame;
    expect(isMostlyBlackAtStoredWindow(frame)).toBe(false);
  });
});

describe("autoWindow", () => {
  it("stretches the window to the frame's 1st-99th percentile pixel range", () => {
    const pixels = Uint16Array.from({ length: 16 * 16 }, (_, i) => 800 + (i % 200));
    const bytes = buildMiniCtDicom({ pixels, windowCenter: 5000, windowWidth: 1000 });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes)) as DicomMono16Frame;

    const window = autoWindow(frame);
    const rgba = rgbaFromFrame(frame, window);

    // The stored window mapped every pixel to black; the stretched window
    // recovers visible contrast across the frame's real value range.
    const grayValues = new Set<number>();
    for (let i = 0; i < rgba.length; i += 4) {
      grayValues.add(rgba[i]);
    }
    expect(grayValues.size).toBeGreaterThan(1);
    expect(Math.max(...grayValues)).toBeGreaterThan(200);
    expect(Math.min(...grayValues)).toBeLessThan(50);
  });

  it("returns a safe non-zero-width window when every pixel has the same value", () => {
    const pixels = new Uint16Array(16 * 16).fill(500);
    const bytes = buildMiniCtDicom({ pixels });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes)) as DicomMono16Frame;

    const window = autoWindow(frame);
    expect(window.width).toBeGreaterThan(0);
  });
});

describe("overlaysFromPart10", () => {
  it("returns no overlays for a plain fixture", () => {
    const bytes = buildMiniCtDicom();
    expect(overlaysFromPart10(new Uint8Array(bytes))).toEqual([]);
  });

  it("reads a 4x4 overlay plane with pixel (1,2) set", () => {
    const pixels = new Uint8Array(4 * 4);
    pixels[1 * 4 + 2] = 1;
    const bytes = buildMiniCtDicom({ overlay: { rows: 4, columns: 4, pixels } });

    const overlays = overlaysFromPart10(new Uint8Array(bytes));
    expect(overlays).toHaveLength(1);
    const [overlay] = overlays;
    expect(overlay).toMatchObject({
      rows: 4,
      columns: 4,
      originRow: 1,
      originColumn: 1,
    });
    expect(overlay.bits[1 * 4 + 2]).toBe(1);
    expect(Array.from(overlay.bits).filter((bit) => bit === 1)).toEqual([1]);
  });

  it("reads a plane with 9 columns, where bits continue across rows without padding", () => {
    const rows = 3;
    const columns = 9; // 27 pixels: row boundaries fall mid-byte.
    const pixels = new Uint8Array(rows * columns);
    pixels[0 * columns + 8] = 1; // last pixel of row 0 -> bit index 8
    pixels[1 * columns + 0] = 1; // first pixel of row 1 -> bit index 9
    const bytes = buildMiniCtDicom({ overlay: { rows, columns, pixels } });

    const [overlay] = overlaysFromPart10(new Uint8Array(bytes));
    expect(overlay.bits[0 * columns + 8]).toBe(1);
    expect(overlay.bits[1 * columns + 0]).toBe(1);
    expect(Array.from(overlay.bits).filter((bit) => bit === 1)).toHaveLength(2);
  });

  it("reads a non-default OverlayOrigin as a 1-based [row, column] pair", () => {
    const pixels = new Uint8Array(4 * 4);
    const bytes = buildMiniCtDicom({
      overlay: { rows: 4, columns: 4, originRow: 2, originColumn: 3, pixels },
    });

    const [overlay] = overlaysFromPart10(new Uint8Array(bytes));
    expect(overlay).toMatchObject({ originRow: 2, originColumn: 3 });
  });

  it("skips a truncated plane but still returns the valid ones", () => {
    const validPixels = new Uint8Array(4 * 4);
    validPixels[1 * 4 + 2] = 1;
    const bytes = buildMiniCtDicom({
      overlays: [
        // Group 0x6000: a normal, valid plane.
        { rows: 4, columns: 4, pixels: validPixels },
        // Group 0x6002: declares 4x4 (needs 2 bytes packed) but only
        // supplies 1 byte of overlay data.
        {
          rows: 4,
          columns: 4,
          pixels: new Uint8Array(4 * 4),
          rawOverlayData: Buffer.from([0x00]),
        },
      ],
    });

    const overlays = overlaysFromPart10(new Uint8Array(bytes));
    expect(overlays).toHaveLength(1);
    expect(overlays[0].bits[1 * 4 + 2]).toBe(1);
  });
});

describe("compositeOverlays", () => {
  it("sets the RGBA of the overlay pixel and leaves neighbours untouched", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    const bits = new Uint8Array(4 * 4);
    bits[1 * 4 + 2] = 1;

    compositeOverlays(rgba, 4, 4, [
      { rows: 4, columns: 4, originRow: 1, originColumn: 1, bits },
    ]);

    const offset = (1 * 4 + 2) * 4;
    expect(Array.from(rgba.subarray(offset, offset + 4))).toEqual([0, 255, 128, 255]);
    expect(Array.from(rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });

  it("shifts by a [row, column] origin", () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4);
    const bits = new Uint8Array(4 * 4);
    bits[0] = 1; // top-left of the overlay plane

    compositeOverlays(rgba, 4, 4, [
      { rows: 4, columns: 4, originRow: 2, originColumn: 3, bits },
    ]);

    // Origin [2, 3] shifts by one row and two columns: (0,0) -> frame (1,2).
    const offset = (1 * 4 + 2) * 4;
    expect(Array.from(rgba.subarray(offset, offset + 4))).toEqual([0, 255, 128, 255]);
    expect(Array.from(rgba.subarray(0, 4))).toEqual([0, 0, 0, 0]);
  });
});

describe("renderFrameRgba", () => {
  it("composites overlay pixels onto an all-zero frame's RGBA", () => {
    // A secondary-capture page whose content lives entirely in an overlay
    // plane (pixel data all zero, one graphics plane) — the CT dose sheet
    // is one of these; the reader-drawn measurement snapshots are another.
    const pixels = new Uint16Array(4 * 4);
    const overlayPixels = new Uint8Array(4 * 4);
    overlayPixels[1 * 4 + 2] = 1;
    const bytes = buildMiniCtDicom({
      rows: 4,
      columns: 4,
      pixels,
      overlay: { rows: 4, columns: 4, pixels: overlayPixels },
    });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes)) as DicomMono16Frame;
    const overlays = overlaysFromPart10(new Uint8Array(bytes));

    const rgba = renderFrameRgba(frame, overlays);

    const offset = (1 * 4 + 2) * 4;
    expect(Array.from(rgba.subarray(offset, offset + 4))).toEqual([0, 255, 128, 255]);
    // A neighbouring pixel is untouched: still plain black from the frame.
    expect(Array.from(rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
  });

  it("passes the window through to the underlying frame rendering", () => {
    const pixels = new Uint16Array(16 * 16).fill(1024);
    const bytes = buildMiniCtDicom({ pixels, rescaleIntercept: -1024, windowCenter: 0, windowWidth: 200 });
    const frame = pixelFrameFromPart10(new Uint8Array(bytes))!;

    const rgba = renderFrameRgba(frame, []);
    expect(rgba[0]).toBe(128);
  });

  it("is a no-op composite when there are no overlays", () => {
    const bytes = buildMiniCtDicom();
    const frame = pixelFrameFromPart10(new Uint8Array(bytes))!;
    expect(renderFrameRgba(frame, [])).toEqual(rgbaFromFrame(frame));
  });
});

describe("multiFrameSourceFromPart10", () => {
  it("reads frame count, rows, and columns from a JPEG Baseline cine", () => {
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B, FRAME_A],
      rows: 8,
      columns: 8,
    });

    const source = multiFrameSourceFromPart10(new Uint8Array(bytes));
    expect(source).toMatchObject({ kind: "jpeg-frames", rows: 8, columns: 8, frameCount: 3 });
  });

  it("returns each frame's own JPEG fragment, starting with the SOI marker", () => {
    const bytes = buildMiniUsCine({ frames: [FRAME_A, FRAME_B], rows: 8, columns: 8 });
    const source = multiFrameSourceFromPart10(new Uint8Array(bytes))!;

    const frame0 = source.frame(0);
    const frame1 = source.frame(1);
    expect(frame0[0]).toBe(0xff);
    expect(frame0[1]).toBe(0xd8);
    expect(frame1[0]).toBe(0xff);
    expect(frame1[1]).toBe(0xd8);
    expect(Array.from(frame0)).toEqual(Array.from(FRAME_A));
    expect(Array.from(frame1)).toEqual(Array.from(FRAME_B));
    expect(Array.from(frame1)).not.toEqual(Array.from(frame0));
  });

  it("reads the frame rate from CineRate when present", () => {
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B],
      rows: 8,
      columns: 8,
      frameRate: 30,
    });
    const source = multiFrameSourceFromPart10(new Uint8Array(bytes));
    expect(source?.frameRate).toBe(30);
  });

  it("falls back to 1000 / FrameTime when CineRate is absent", () => {
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B],
      rows: 8,
      columns: 8,
      frameTime: 40, // ms -> 25 fps
    });
    const source = multiFrameSourceFromPart10(new Uint8Array(bytes));
    expect(source?.frameRate).toBe(25);
  });

  it("is null (a still image) when neither CineRate nor FrameTime is present", () => {
    const bytes = buildMiniUsCine({ frames: [FRAME_A], rows: 8, columns: 8 });
    const source = multiFrameSourceFromPart10(new Uint8Array(bytes));
    expect(source?.frameRate).toBeNull();
    expect(source?.frameCount).toBe(1);
  });

  it("indexes the frames itself when the Basic Offset Table is empty", () => {
    // An empty Basic Offset Table is legal (DICOM PS3.5 A.4) and common on
    // real scanners; `dicomParser.readEncapsulatedImageFrame` throws for it.
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B, FRAME_A],
      rows: 8,
      columns: 8,
      emptyBasicOffsetTable: true,
    });

    const source = multiFrameSourceFromPart10(new Uint8Array(bytes))!;
    expect(source.frameCount).toBe(3);
    for (const index of [0, 1, 2]) {
      const frame = source.frame(index);
      expect([frame[0], frame[1]]).toEqual([0xff, 0xd8]);
    }
    expect(Array.from(source.frame(0))).toEqual(Array.from(FRAME_A));
    expect(Array.from(source.frame(1))).toEqual(Array.from(FRAME_B));
  });

  it("concatenates a frame's continuation fragments, up to the next SOI marker", () => {
    // One frame per *fragment* is the common encoding, but not the required
    // one: a frame may span several fragments, only the first of which
    // starts with FF D8.
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B],
      rows: 8,
      columns: 8,
      emptyBasicOffsetTable: true,
      fragmentsPerFrame: 3,
    });

    const source = multiFrameSourceFromPart10(new Uint8Array(bytes))!;
    expect(source.frameCount).toBe(2);
    expect(Array.from(source.frame(0))).toEqual(Array.from(FRAME_A));
    expect(Array.from(source.frame(1))).toEqual(Array.from(FRAME_B));
  });

  it("reports the whole file as its byteCost, since it closes over those bytes", () => {
    // The source decodes frames on demand from the fragments it holds, so
    // it pins the entire file for as long as it is reachable. A caller
    // bounding memory has to be able to see that cost -- rows x columns
    // would describe one decoded frame, not what is actually retained.
    const bytes = buildMiniUsCine({
      frames: [FRAME_A, FRAME_B, FRAME_A],
      rows: 8,
      columns: 8,
    });

    const source = multiFrameSourceFromPart10(new Uint8Array(bytes))!;

    expect(source.byteCost).toBe(bytes.byteLength);
    expect(source.byteCost).toBeGreaterThan(source.rows * source.columns);
  });

  it("returns null for a non-JPEG-Baseline transfer syntax (e.g. a CT slice)", () => {
    const bytes = buildMiniCtDicom();
    expect(multiFrameSourceFromPart10(new Uint8Array(bytes))).toBeNull();
  });

  it("returns null for bytes that are not a Part 10 file", () => {
    expect(multiFrameSourceFromPart10(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
