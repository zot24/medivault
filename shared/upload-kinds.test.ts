import { describe, expect, it } from "vitest";
import {
  acceptedExtensions,
  classifyUpload,
  displayTags,
  fitsUploadCap,
  focusSliceIndex,
  groupDocuments,
  isDicomDocument,
  newSeriesTag,
  newSliceTag,
  seriesIdFromTags,
  sliceCountLabel,
  sliceDeltaFromKey,
  stackDocuments,
  stepSliceIndex,
  visibleBrowseItems,
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

describe("groupDocuments", () => {
  const slice = (id: number, fileName: string, tags: string[]) => ({
    id,
    mimeType: "application/dicom",
    fileName,
    tags,
  });

  it("collapses one series into a single browse item in vault order", () => {
    const tag = "series:stack-a";
    const first = slice(1, "s-02.dcm", [tag, "slice:1"]);
    const second = slice(2, "s-01.dcm", [tag, "slice:0"]);
    const pdf = {
      id: 3,
      mimeType: "application/pdf",
      fileName: "labs.pdf",
      tags: [] as string[],
    };
    const lone = slice(4, "lone.dcm", []);

    expect(groupDocuments([first, pdf, second, lone])).toEqual([
      {
        kind: "series",
        seriesId: "stack-a",
        documents: [second, first],
      },
      { kind: "file", document: pdf },
      { kind: "file", document: lone },
    ]);
  });

  it("keeps two series as two browse items", () => {
    const a = slice(1, "a.dcm", ["series:one", "slice:0"]);
    const b = slice(2, "b.dcm", ["series:two", "slice:0"]);
    expect(groupDocuments([a, b])).toEqual([
      { kind: "series", seriesId: "one", documents: [a] },
      { kind: "series", seriesId: "two", documents: [b] },
    ]);
  });
});

describe("visibleBrowseItems", () => {
  it("keeps a series when any sibling matches the filter", () => {
    const tag = "series:stack-a";
    const first = {
      id: 1,
      mimeType: "application/dicom",
      fileName: "s-02.dcm",
      tags: [tag, "slice:1"],
    };
    const second = {
      id: 2,
      mimeType: "application/dicom",
      fileName: "s-01.dcm",
      tags: [tag, "slice:0"],
    };
    const pdf = {
      id: 3,
      mimeType: "application/pdf",
      fileName: "labs.pdf",
      tags: [] as string[],
    };
    expect(visibleBrowseItems([first, pdf, second], [first])).toEqual([
      {
        kind: "series",
        seriesId: "stack-a",
        documents: [second, first],
      },
    ]);
  });
});

describe("focusSliceIndex", () => {
  it("returns the focus row index in the stacked series", () => {
    const stack = [
      { id: 10, mimeType: "application/dicom", fileName: "a.dcm", tags: [] },
      { id: 11, mimeType: "application/dicom", fileName: "b.dcm", tags: [] },
      { id: 12, mimeType: "application/dicom", fileName: "c.dcm", tags: [] },
    ];
    expect(focusSliceIndex(stack[2], stack)).toBe(2);
  });

  it("returns 0 when the focus is not in the stack", () => {
    expect(focusSliceIndex({ id: 9 }, [{ id: 1 }, { id: 2 }])).toBe(0);
  });
});

describe("displayTags", () => {
  it("hides series and slice tags from the card", () => {
    expect(
      displayTags(["series:abc", "follow-up", "slice:3", "lab"]),
    ).toEqual(["follow-up", "lab"]);
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
