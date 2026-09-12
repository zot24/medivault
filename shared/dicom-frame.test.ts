import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pixelFrameFromPart10 } from "./dicom-frame";
import {
  TRANSFER_JPEG_LOSSLESS,
  TRANSFER_RLE,
  buildMiniCtDicom,
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
    expect(frame?.pixels[0]).toBe(12);
    expect(frame?.pixels[1]).toBe(4000);
  });
});
