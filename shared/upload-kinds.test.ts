import { describe, expect, it } from "vitest";
import {
  acceptedExtensions,
  classifyUpload,
  fitsUploadCap,
  isDicomDocument,
  newSeriesTag,
  newSliceTag,
  seriesIdFromTags,
  stackDocuments,
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

describe("stackDocuments", () => {
  const slice = (id: number, fileName: string, tags: string[]) => ({
    id,
    mimeType: "application/dicom",
    fileName,
    tags,
  });

  it("returns only the focus file when no series tag is present", () => {
    const focus = slice(3, "b.dcm", []);
    expect(stackDocuments(focus, [slice(1, "a.dcm", []), focus])).toEqual([
      focus,
    ]);
  });

  it("returns tagged siblings sorted by slice tag then file name", () => {
    const tag = newSeriesTag();
    expect(tag.startsWith("series:")).toBe(true);
    const a = slice(1, "z-02.dcm", [tag, newSliceTag(1)]);
    const b = slice(2, "z-01.dcm", [tag, newSliceTag(0)]);
    const other = slice(9, "other.dcm", [newSeriesTag(), newSliceTag(0)]);
    expect(stackDocuments(a, [a, other, b])).toEqual([b, a]);
    expect(seriesIdFromTags(a.tags)).toBe(tag.slice("series:".length));
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
