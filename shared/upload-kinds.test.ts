import { describe, expect, it } from "vitest";
import {
  acceptedExtensions,
  chunkFiles,
  classifyUpload,
  fitsUploadCap,
  isDicomDocument,
  nextSliceToLoad,
  sliceCountLabel,
  sliceDeltaFromKey,
  stepSliceIndex,
} from "./upload-kinds";

describe("classifyUpload", () => {
  it("accepts a pdf by mime", () => {
    expect(
      classifyUpload({
        mimeType: "application/pdf",
        originalName: "labs.pdf",
      }),
    ).toEqual({ mimeType: "application/pdf", extension: ".pdf" });
  });

  it("accepts dicom by mime even when the name has no extension", () => {
    expect(
      classifyUpload({
        mimeType: "application/dicom",
        originalName: "CT001",
      }),
    ).toEqual({ mimeType: "application/dicom", extension: ".dcm" });
  });

  it("accepts a .dcm with an empty browser mime", () => {
    expect(
      classifyUpload({
        mimeType: "",
        originalName: "slice-12.dcm",
      }),
    ).toEqual({ mimeType: "application/dicom", extension: ".dcm" });
  });

  it("accepts a .dcm declared as octet-stream", () => {
    expect(
      classifyUpload({
        mimeType: "application/octet-stream",
        originalName: "slice-12.DCM",
      }),
    ).toEqual({ mimeType: "application/dicom", extension: ".dcm" });
  });

  it("rejects an executable", () => {
    expect(
      classifyUpload({
        mimeType: "application/x-msdownload",
        originalName: "payload.exe",
      }),
    ).toBeNull();
  });

  it("accepts an extensionless Part-10 file declared as octet-stream", () => {
    const bytes = new Uint8Array(132);
    bytes.set([0x44, 0x49, 0x43, 0x4d], 128);
    expect(
      classifyUpload({
        mimeType: "application/octet-stream",
        originalName: "CT000001",
        bytes,
      }),
    ).toEqual({ mimeType: "application/dicom", extension: ".dcm" });
  });

  it("accepts an extensionless Part-10 file with an empty browser mime", () => {
    const bytes = new Uint8Array(132);
    bytes.set([0x44, 0x49, 0x43, 0x4d], 128);
    expect(
      classifyUpload({
        mimeType: "",
        originalName: "CT000001",
        bytes,
      }),
    ).toEqual({ mimeType: "application/dicom", extension: ".dcm" });
  });

  it("rejects an extensionless octet-stream that is not Part-10", () => {
    expect(
      classifyUpload({
        mimeType: "application/octet-stream",
        originalName: "CT000001",
        bytes: new Uint8Array(132),
      }),
    ).toBeNull();
  });
});

describe("acceptedExtensions", () => {
  it("includes dcm so owner open can serve a stored series file", () => {
    expect(acceptedExtensions()).toContain(".dcm");
  });
});

describe("isDicomDocument", () => {
  it("treats application/dicom as viewable in the series viewer", () => {
    expect(
      isDicomDocument({
        mimeType: "application/dicom",
        fileName: "slice.dcm",
      }),
    ).toBe(true);
  });

  it("does not treat a pdf as dicom", () => {
    expect(
      isDicomDocument({
        mimeType: "application/pdf",
        fileName: "labs.pdf",
      }),
    ).toBe(false);
  });
});

describe("sliceCountLabel", () => {
  it("uses the plural form for more than one slice", () => {
    expect(sliceCountLabel(24)).toBe("24 slices");
    expect(sliceCountLabel(1)).toBe("1 slice");
  });
});

describe("stepSliceIndex", () => {
  it("clamps wheel and key steps inside the stack", () => {
    expect(stepSliceIndex(0, -1, 24)).toBe(0);
    expect(stepSliceIndex(11, 1, 24)).toBe(12);
    expect(stepSliceIndex(23, 1, 24)).toBe(23);
    expect(stepSliceIndex(0, 1, 0)).toBe(0);
  });
});

describe("sliceDeltaFromKey", () => {
  it("maps arrow keys to a slice step", () => {
    expect(sliceDeltaFromKey("ArrowRight")).toBe(1);
    expect(sliceDeltaFromKey("ArrowDown")).toBe(1);
    expect(sliceDeltaFromKey("ArrowLeft")).toBe(-1);
    expect(sliceDeltaFromKey("ArrowUp")).toBe(-1);
    expect(sliceDeltaFromKey("Enter")).toBeNull();
  });
});

describe("fitsUploadCap", () => {
  it("accepts a 12 MiB object that the old 10 MiB cap would reject", () => {
    expect(fitsUploadCap(12 * 1024 * 1024)).toBe(true);
  });

  it("rejects an object larger than the documented 50 MiB spike cap", () => {
    expect(fitsUploadCap(50 * 1024 * 1024 + 1)).toBe(false);
  });
});

describe("chunkFiles", () => {
  it("splits a long series into request-sized batches in order", () => {
    const items = Array.from({ length: 7 }, (_, index) => index);
    expect(chunkFiles(items, 3)).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
  });

  it("returns one batch when everything fits", () => {
    expect(chunkFiles([1, 2], 3)).toEqual([[1, 2]]);
    expect(chunkFiles([], 3)).toEqual([]);
  });
});

describe("nextSliceToLoad", () => {
  it("walks outwards from the slice on screen", () => {
    const taken = new Set<number>();
    const order: number[] = [];
    for (;;) {
      const next = nextSliceToLoad(3, 7, (p) => taken.has(p));
      if (next == null) break;
      taken.add(next);
      order.push(next);
    }
    expect(order).toEqual([3, 4, 2, 5, 1, 6, 0]);
  });

  it("returns null once everything is taken or in flight", () => {
    expect(nextSliceToLoad(0, 2, () => true)).toBeNull();
    expect(nextSliceToLoad(0, 0, () => false)).toBeNull();
  });
});
