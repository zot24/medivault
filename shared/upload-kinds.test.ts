import { describe, expect, it } from "vitest";
import {
  acceptedExtensions,
  chunkFiles,
  classifyUpload,
  countLabel,
  describeSeriesUpload,
  exceedsAggregateUploadCap,
  fitsUploadCap,
  isDicomDocument,
  isHeavyUpload,
  localDate,
  MAX_REQUEST_UPLOAD_BYTES,
  nextSliceToLoad,
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

describe("countLabel", () => {
  it("reads a volume as N slices", () => {
    expect(countLabel("volume", 774)).toBe("774 slices");
    expect(countLabel("volume", 1)).toBe("1 slice");
  });

  it("reads phases as phase count x slices per phase, frames carrying the per-phase slice count", () => {
    expect(countLabel("phases", 5800, 580)).toBe("10 phases × 580 slices");
  });

  it("reads a multi-file ultrasound record as N views", () => {
    expect(countLabel("views", 56)).toBe("56 views");
    expect(countLabel("views", 1)).toBe("1 view");
  });

  it("reads runs as N runs, with a frame total when it's known", () => {
    expect(countLabel("runs", 3, 298)).toBe("3 runs · 298 frames");
    expect(countLabel("runs", 3)).toBe("3 runs");
    expect(countLabel("runs", 1, 108)).toBe("1 run · 108 frames");
    expect(countLabel("runs", 1, 1)).toBe("1 run · 1 frame");
  });

  it("reads a single-file record as 1 image", () => {
    expect(countLabel("single", 1)).toBe("1 image");
  });

  it("reads a report record as N reports", () => {
    expect(countLabel("report", 1)).toBe("1 report");
    expect(countLabel("report", 3)).toBe("3 reports");
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
    expect(fitsUploadCap(12 * 1024 * 1024, "application/pdf")).toBe(true);
  });

  it("rejects an object larger than the documented 50 MiB spike cap", () => {
    expect(fitsUploadCap(50 * 1024 * 1024 + 1, "application/pdf")).toBe(false);
  });

  it("rejects a 51 MB pdf", () => {
    expect(fitsUploadCap(51 * 1024 * 1024, "application/pdf")).toBe(false);
  });

  it("accepts a 200 MB dicom file, above the pdf/image cap", () => {
    expect(fitsUploadCap(200 * 1024 * 1024, "application/dicom")).toBe(true);
  });

  it("rejects a 300 MB dicom file, above the dicom cap", () => {
    expect(fitsUploadCap(300 * 1024 * 1024, "application/dicom")).toBe(false);
  });
});

describe("exceedsAggregateUploadCap", () => {
  it("accepts a request whose files sum to exactly the default cap", () => {
    expect(exceedsAggregateUploadCap([MAX_REQUEST_UPLOAD_BYTES])).toBe(false);
  });

  it("rejects a request whose files sum to one byte over the default cap", () => {
    expect(exceedsAggregateUploadCap([MAX_REQUEST_UPLOAD_BYTES + 1])).toBe(true);
  });

  it("sums many files under multer's per-file cap that together exceed the aggregate one", () => {
    // 3 angiography runs at 200 MB each: each fits under MAX_DICOM_UPLOAD_BYTES
    // (256 MB) alone, but 600 MB total is over the default 512 MB aggregate cap.
    const sizes = [200, 200, 200].map((mb) => mb * 1024 * 1024);
    expect(exceedsAggregateUploadCap(sizes)).toBe(true);
  });

  it("accepts an empty file list", () => {
    expect(exceedsAggregateUploadCap([])).toBe(false);
  });

  it("honors a custom cap", () => {
    expect(exceedsAggregateUploadCap([100], 99)).toBe(true);
    expect(exceedsAggregateUploadCap([100], 100)).toBe(false);
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

describe("localDate", () => {
  it("keeps the calendar date regardless of the local timezone", () => {
    const date = localDate("2026-09-11");
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(11);
  });
});

describe("describeSeriesUpload", () => {
  it("summarises slices, size, and how many requests the upload takes", () => {
    const files = Array.from({ length: 120 }, () => ({ size: 250 * 1024 }));
    expect(describeSeriesUpload(files)).toEqual({
      slices: 120,
      totalBytes: 120 * 250 * 1024,
      requests: 3,
      sizeLabel: "29.3 MB",
    });
  });

  it("shows small totals in KB and single files as one request", () => {
    expect(describeSeriesUpload([{ size: 900 }])).toEqual({
      slices: 1,
      totalBytes: 900,
      requests: 1,
      sizeLabel: "0.9 KB",
    });
  });

  it("flags a heavy upload above the advisory threshold", () => {
    const light = Array.from({ length: 10 }, () => ({ size: 1024 * 1024 }));
    const heavy = Array.from({ length: 400 }, () => ({ size: 1024 * 1024 }));
    expect(isHeavyUpload(describeSeriesUpload(light))).toBe(false);
    expect(isHeavyUpload(describeSeriesUpload(heavy))).toBe(true);
  });
});
