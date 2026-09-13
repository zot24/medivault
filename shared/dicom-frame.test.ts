import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoWindow,
  compositeOverlays,
  describeUndrawableFrame,
  isMostlyBlackAtStoredWindow,
  overlaysFromPart10,
  pixelFrameFromPart10,
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
} from "./mini-ct-dicom";

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
