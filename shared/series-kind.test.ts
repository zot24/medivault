import { describe, expect, it } from "vitest";
import { runLabel, seriesKind, viewLabel } from "./series-kind";

describe("seriesKind", () => {
  it("reads a CT record with several slices as a volume", () => {
    expect(seriesKind({ modality: "CT" }, 774)).toBe("volume");
  });

  it("reads a CT record with detected phases as phases", () => {
    expect(seriesKind({ modality: "CT" }, 5800, true)).toBe("phases");
  });

  it("reads an MR record the same way a CT one is read", () => {
    expect(seriesKind({ modality: "MR" }, 120)).toBe("volume");
    expect(seriesKind({ modality: "MR" }, 120, true)).toBe("phases");
  });

  it("reads a multi-file ultrasound record as views", () => {
    expect(seriesKind({ modality: "US" }, 56)).toBe("views");
  });

  it("reads a multi-file angiography record as runs", () => {
    expect(seriesKind({ modality: "XA" }, 3)).toBe("runs");
  });

  it("reads any single-file record as single, regardless of modality", () => {
    expect(seriesKind({ modality: "CT" }, 1)).toBe("single");
    expect(seriesKind({ modality: "US" }, 1)).toBe("single");
    expect(seriesKind({ modality: "XA" }, 1)).toBe("single");
  });

  it("reads an SR record as a report, even with several files", () => {
    expect(seriesKind({ modality: "SR" }, 1)).toBe("report");
    expect(seriesKind({ modality: "SR" }, 3)).toBe("report");
  });
});

describe("viewLabel", () => {
  const still = { imageType: [], usRegionDataTypes: [], numberOfFrames: 1, frameRate: null };

  it("labels a single-frame file as Still", () => {
    expect(viewLabel(still)).toBe("Still");
  });

  it("labels a region with RegionDataType 2 or 3 as Colour Doppler", () => {
    expect(viewLabel({ ...still, numberOfFrames: 20, usRegionDataTypes: [1, 2] })).toBe(
      "Colour Doppler",
    );
    expect(viewLabel({ ...still, numberOfFrames: 20, usRegionDataTypes: [3] })).toBe(
      "Colour Doppler",
    );
  });

  it("does not call a plain 2-D region (RegionDataType 1) Colour Doppler", () => {
    expect(viewLabel({ ...still, numberOfFrames: 20, frameRate: 10, usRegionDataTypes: [1] })).toBe(
      "Loop 20 · 2.0 s",
    );
  });

  it("labels an M-mode ImageType", () => {
    expect(viewLabel({ ...still, numberOfFrames: 1, imageType: ["DERIVED", "M-MODE"] })).toBe(
      "M-mode",
    );
  });

  it("falls back to a duration label for a plain cine loop", () => {
    expect(viewLabel({ ...still, numberOfFrames: 12, frameRate: 7 })).toBe("Loop 12 · 1.7 s");
  });

  it("falls back to a bare frame count when the rate is unknown", () => {
    expect(viewLabel({ ...still, numberOfFrames: 12, frameRate: null })).toBe("Loop 12");
  });
});

describe("runLabel", () => {
  it("reads projection angles per DICOM: positive primary is LAO, positive secondary is CRA", () => {
    expect(
      runLabel(
        { positionerPrimaryAngle: 30, positionerSecondaryAngle: 20, numberOfFrames: 92 },
        2,
      ),
    ).toBe("LAO 30° / CRA 20°");
  });

  it("reads negative angles as RAO / CAU", () => {
    expect(
      runLabel(
        { positionerPrimaryAngle: -30, positionerSecondaryAngle: -20, numberOfFrames: 92 },
        1,
      ),
    ).toBe("RAO 30° / CAU 20°");
  });

  it("falls back to the run number and frame count when no angle is present", () => {
    expect(
      runLabel({ positionerPrimaryAngle: null, positionerSecondaryAngle: null, numberOfFrames: 92 }, 2),
    ).toBe("Run 2 · 92 frames");
  });

  it("keeps 'frame' singular for a single-frame run", () => {
    expect(
      runLabel({ positionerPrimaryAngle: null, positionerSecondaryAngle: null, numberOfFrames: 1 }, 1),
    ).toBe("Run 1 · 1 frame");
  });
});
