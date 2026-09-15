import { describe, expect, it } from "vitest";
import { thumbnailPosition } from "./study-thumbnail";

describe("thumbnailPosition", () => {
  it("uses the only file of a single-file record", () => {
    expect(thumbnailPosition({ fileCount: 1, dicomMeta: { modality: "CT" } })).toBe(0);
  });

  it("uses the middle slice of a CT volume", () => {
    expect(thumbnailPosition({ fileCount: 580, dicomMeta: { modality: "CT" } })).toBe(290);
    expect(thumbnailPosition({ fileCount: 580 })).toBe(290);
  });

  it("uses the first run of an angiography record and the first view of an echo record", () => {
    // Regression: the middle run of a three-run cath record was fetched
    // whole (92 MB) for its thumbnail, which then couldn't be drawn.
    expect(thumbnailPosition({ fileCount: 3, dicomMeta: { modality: "XA" } })).toBe(0);
    expect(thumbnailPosition({ fileCount: 56, dicomMeta: { modality: "US" } })).toBe(0);
  });
});
