import { describe, expect, it } from "vitest";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import { documentFileUrl, documentFrameUrl } from "./owned-file";
import { mono8FrameFromRangeResponse, thumbnailFrameSource } from "./thumbnail-frame-source";

function xaMeta(overrides: Partial<DicomSeriesMeta> = {}): DicomSeriesMeta {
  return {
    studyInstanceUid: "study-1",
    seriesInstanceUid: "series-1",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.12.1",
    modality: "XA",
    studyDescription: "",
    seriesDescription: "",
    seriesNumber: 1,
    rows: 1000,
    columns: 1000,
    numberOfFrames: 96,
    frameRate: 15,
    photometric: "MONOCHROME2",
    transferSyntaxUid: "1.2.840.10008.1.2.1", // explicit VR little endian, uncompressed
    sliceThickness: null,
    imageType: [],
    hasOverlay: false,
    ...overrides,
  };
}

describe("thumbnailFrameSource", () => {
  it("uses the range endpoint, not the whole-file endpoint, for an uncompressed multi-frame file at position 0", () => {
    // This is the angiography case (plan 07): a ~100 MB uncompressed
    // multi-frame file. Fetching the whole file here defeats the plan's
    // point (client/src/lib/thumbnails.ts's old behavior).
    const source = thumbnailFrameSource(42, 0, xaMeta());
    expect(source).toEqual({ kind: "frame-range", url: documentFrameUrl(42, 0, 0) });
    expect(source.url).not.toBe(documentFileUrl(42, 0));
  });

  it("fetches the whole file for a compressed multi-frame series (JPEG Baseline ultrasound)", () => {
    const source = thumbnailFrameSource(42, 0, xaMeta({ transferSyntaxUid: "1.2.840.10008.1.2.4.50" }));
    expect(source).toEqual({ kind: "whole-file", url: documentFileUrl(42, 0) });
  });

  it("fetches the whole file for a single-frame series", () => {
    const source = thumbnailFrameSource(42, 0, xaMeta({ numberOfFrames: 1 }));
    expect(source).toEqual({ kind: "whole-file", url: documentFileUrl(42, 0) });
  });

  it("fetches the whole file with no dicomMeta available", () => {
    const source = thumbnailFrameSource(42, 0, null);
    expect(source).toEqual({ kind: "whole-file", url: documentFileUrl(42, 0) });
  });

  it("fetches the whole file at a non-zero position when nothing vouches for that file", () => {
    // dicomMeta describes only the document's first file (shared/dicom-meta.ts);
    // a later position's own dimensions/transfer syntax may differ, so the
    // series-level shortcut only applies at position 0.
    const source = thumbnailFrameSource(42, 1, xaMeta());
    expect(source).toEqual({ kind: "whole-file", url: documentFileUrl(42, 1) });
  });

  it("uses the range endpoint at a non-zero position when the file's own row carries a frame index", () => {
    // Regression: runs 2 and 3 of a real cath record (92 MB and 98 MB,
    // uncompressed multi-frame) were fetched whole for a 128 px thumbnail
    // — and then couldn't be drawn, so the strip showed a blank placeholder.
    // The files list marks each such file with `frameIndex`; that is enough.
    const source = thumbnailFrameSource(42, 2, xaMeta(), undefined, {
      frameIndex: { numberOfFrames: 98 },
    });
    expect(source).toEqual({ kind: "frame-range", url: documentFrameUrl(42, 2, 0) });
  });

  it("ignores a row without a frame index (a JPEG echo loop past position 0)", () => {
    const source = thumbnailFrameSource(42, 2, xaMeta({ transferSyntaxUid: "1.2.840.10008.1.2.4.50" }), undefined, {
      frameIndex: null,
    });
    expect(source).toEqual({ kind: "whole-file", url: documentFileUrl(42, 2) });
  });
});

describe("mono8FrameFromRangeResponse", () => {
  it("builds a mono8 frame from the frame endpoint's headers and body", async () => {
    const pixels = Uint8Array.from([1, 2, 3, 4]);
    const response = new Response(pixels, {
      headers: {
        "X-Frame-Rows": "2",
        "X-Frame-Columns": "2",
        "X-Window-Center": "128",
        "X-Window-Width": "256",
      },
    });

    const frame = await mono8FrameFromRangeResponse(response);
    expect(frame.kind).toBe("mono8");
    expect(frame.rows).toBe(2);
    expect(frame.columns).toBe(2);
    expect(frame.windowCenter).toBe(128);
    expect(frame.windowWidth).toBe(256);
    expect(Array.from(frame.pixels)).toEqual([1, 2, 3, 4]);
  });
});
