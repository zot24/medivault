import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  describeUndrawableFrame,
  pixelFrameFromPart10,
  rgbaFromFrame,
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
