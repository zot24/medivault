import { describe, expect, it } from "vitest";
import { readFileMeta, readSeriesMeta, readSopInstanceUid, seriesGroup, seriesLabel } from "./dicom-meta";
import { buildMiniCtDicom, buildMiniScRgbDicom } from "./mini-ct-dicom";

const EXPECTED_KEYS = [
  "studyInstanceUid",
  "seriesInstanceUid",
  "sopClassUid",
  "modality",
  "studyDescription",
  "seriesDescription",
  "seriesNumber",
  "rows",
  "columns",
  "numberOfFrames",
  "frameRate",
  "photometric",
  "transferSyntaxUid",
  "sliceThickness",
  "imageType",
  "hasOverlay",
].sort();

describe("readSeriesMeta", () => {
  it("reads study, series, and imaging metadata from a generated CT slice", () => {
    const bytes = buildMiniCtDicom({
      studyInstanceUid: "1.2.3.study",
      seriesInstanceUid: "1.2.3.series",
      modality: "CT",
      seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      sliceThickness: 0.6,
      rows: 16,
      columns: 16,
    });

    const meta = readSeriesMeta(new Uint8Array(bytes));

    expect(meta).toMatchObject({
      studyInstanceUid: "1.2.3.study",
      seriesInstanceUid: "1.2.3.series",
      modality: "CT",
      seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      sliceThickness: 0.6,
      rows: 16,
      columns: 16,
      numberOfFrames: 1,
      photometric: "MONOCHROME2",
      hasOverlay: false,
    });
  });

  it("reads the frame rate from CineRate", () => {
    const bytes = buildMiniCtDicom({ modality: "US", cineRate: 30 });
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.frameRate).toBe(30);
  });

  it("falls back to 1000 / FrameTime when CineRate is absent", () => {
    const bytes = buildMiniCtDicom({ modality: "US", frameTime: 40 });
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.frameRate).toBe(25);
  });

  it("has a null frame rate when neither tag is present", () => {
    const bytes = buildMiniCtDicom({ modality: "CT" });
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.frameRate).toBeNull();
  });

  it("never contains any patient or date identifier — only this exact key set", () => {
    const bytes = buildMiniCtDicom();
    const meta = readSeriesMeta(new Uint8Array(bytes));

    expect(meta).not.toBeNull();
    expect(Object.keys(meta!).sort()).toEqual(EXPECTED_KEYS);
  });

  it("splits imageType on backslash", () => {
    const bytes = buildMiniCtDicom({
      imageType: ["ORIGINAL", "PRIMARY", "LOCALIZER"],
    });
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.imageType).toEqual(["ORIGINAL", "PRIMARY", "LOCALIZER"]);
  });

  it("defaults numberOfFrames to 1 and hasOverlay to false when absent", () => {
    // TODO(plan 03): once mini-ct-dicom.ts grows an overlay-plane option,
    // add a case here asserting hasOverlay is true.
    const bytes = buildMiniCtDicom();
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.numberOfFrames).toBe(1);
    expect(meta?.hasOverlay).toBe(false);
  });

  it("reads a secondary-capture RGB series", () => {
    const bytes = buildMiniScRgbDicom();
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta).toMatchObject({
      studyInstanceUid: "1.2.826.0.1.3680043.8.498.study.1",
      seriesInstanceUid: "1.2.826.0.1.3680043.8.498.series.sc",
      photometric: "RGB",
    });
  });

  it("returns null for bytes that are not a Part 10 file", () => {
    expect(readSeriesMeta(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it("treats a blank SliceThickness as absent, not zero", () => {
    // dicom-parser trims a purely-whitespace element down to "", which the
    // !raw guard already catches. The gap is a multi-valued element whose
    // *first* token is blank/whitespace ("\3.0"): the element itself isn't
    // empty, but Number("") for that first token must not read as 0.
    const bytes = buildMiniCtDicom({ sliceThickness: "\\3.0" });
    const meta = readSeriesMeta(new Uint8Array(bytes));
    expect(meta?.sliceThickness).toBeNull();
  });
});

describe("readFileMeta", () => {
  it("reads instance number and the third value of ImagePositionPatient as slice location", () => {
    const bytes = buildMiniCtDicom({
      instanceNumber: 7,
      imagePositionPatient: [-150, -150, 42.5],
    });
    expect(readFileMeta(new Uint8Array(bytes))).toMatchObject({
      instanceNumber: 7,
      sliceLocation: 42.5,
      phase: null,
    });
  });

  it("falls back to SliceLocation when ImagePositionPatient is absent", () => {
    const bytes = buildMiniCtDicom({ instanceNumber: 2, sliceLocation: 12 });
    expect(readFileMeta(new Uint8Array(bytes))).toMatchObject({
      instanceNumber: 2,
      sliceLocation: 12,
      phase: null,
    });
  });

  it("prefers ImagePositionPatient's z value over SliceLocation when both are present", () => {
    const bytes = buildMiniCtDicom({
      imagePositionPatient: [0, 0, 5],
      sliceLocation: 999,
    });
    expect(readFileMeta(new Uint8Array(bytes))?.sliceLocation).toBe(5);
  });

  it("reads NominalPercentageOfCardiacPhase as phase", () => {
    const bytes = buildMiniCtDicom({ nominalCardiacPhase: 70 });
    expect(readFileMeta(new Uint8Array(bytes))?.phase).toBe(70);
  });

  it("falls back to TriggerTime (ms) when no cardiac-phase percentage is present", () => {
    const bytes = buildMiniCtDicom({ triggerTime: 620 });
    expect(readFileMeta(new Uint8Array(bytes))?.phase).toBe(620);
  });

  it("prefers NominalPercentageOfCardiacPhase over TriggerTime when both are present", () => {
    const bytes = buildMiniCtDicom({ nominalCardiacPhase: 30, triggerTime: 400 });
    expect(readFileMeta(new Uint8Array(bytes))?.phase).toBe(30);
  });

  it("returns nulls for every field when none of the tags are present", () => {
    const bytes = buildMiniCtDicom();
    expect(readFileMeta(new Uint8Array(bytes))).toMatchObject({
      instanceNumber: 1,
      sliceLocation: null,
      phase: null,
    });
  });

  it("returns null for bytes that are not a Part 10 file", () => {
    expect(readFileMeta(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});

/** Builds a fixture meta object for table-driven label/group tests below. */
function meta(overrides: Partial<ReturnType<typeof baseMeta>> = {}) {
  return { ...baseMeta(), ...overrides };
}

function baseMeta() {
  return {
    studyInstanceUid: "study-1",
    seriesInstanceUid: "series-1",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    modality: "CT",
    studyDescription: "",
    seriesDescription: "",
    seriesNumber: null as number | null,
    rows: 512,
    columns: 512,
    numberOfFrames: 1,
    frameRate: null as number | null,
    photometric: "MONOCHROME2",
    transferSyntaxUid: "1.2.840.10008.1.2.4.70",
    sliceThickness: null as number | null,
    imageType: [] as string[],
    hasOverlay: false,
  };
}

describe("seriesLabel", () => {
  it.each([
    [
      "SR report with a title",
      meta({ modality: "SR", seriesDescription: "Diagnostic Imaging Report" }),
      "Report — Diagnostic Imaging Report",
    ],
    ["SR report without a title", meta({ modality: "SR" }), "Report"],
    [
      "localizer",
      meta({ imageType: ["ORIGINAL", "PRIMARY", "LOCALIZER"] }),
      "Scout image",
    ],
    [
      "mono secondary-capture snapshot with a phase",
      meta({
        imageType: ["DERIVED", "SECONDARY"],
        numberOfFrames: 1,
        photometric: "MONOCHROME2",
        seriesDescription: "MPR BestDiast 77 %",
      }),
      "Measurement snapshot, 77 % phase",
    ],
    [
      "mono secondary-capture snapshot without a phase",
      meta({
        imageType: ["DERIVED", "SECONDARY"],
        numberOfFrames: 1,
        photometric: "MONOCHROME2",
      }),
      "Measurement snapshot",
    ],
    [
      "rgb secondary-capture analysis output",
      meta({ imageType: ["DERIVED", "SECONDARY"], photometric: "RGB" }),
      "Analysis charts",
    ],
    [
      "dose sheet, matched by ImageType containing PROT",
      meta({
        imageType: ["DERIVED", "SECONDARY", "OTHER", "CT_SOM5", "PROT"],
        photometric: "MONOCHROME2",
        numberOfFrames: 1,
      }),
      "Dose sheet",
    ],
    [
      "dose sheet, matched by a Spanish protocol series description",
      meta({
        imageType: ["DERIVED", "SECONDARY"],
        photometric: "MONOCHROME2",
        numberOfFrames: 1,
        seriesDescription: "Protocolo de paciente",
      }),
      "Dose sheet",
    ],
    [
      "CT volume at best diastole",
      meta({
        modality: "CT",
        sliceThickness: 0.6,
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      }),
      "CT volume, 0.6 mm, best diastole",
    ],
    [
      "CT volume at best systole",
      meta({
        modality: "CT",
        sliceThickness: 0.6,
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestSyst 27 %",
      }),
      "CT volume, 0.6 mm, best systole",
    ],
    [
      "CT volume across the full cardiac cycle",
      meta({
        modality: "CT",
        sliceThickness: 0.75,
        seriesDescription: "DS_CorCTA 0.75 Bv40 3 10 - 100 %",
      }),
      "CT volume, 0.75 mm, multi-phase",
    ],
    [
      "CT volume with no phase markers",
      meta({ modality: "CT", sliceThickness: 3 }),
      "CT volume, 3 mm",
    ],
    [
      "echo cine loop with a known frame rate",
      meta({ modality: "US", numberOfFrames: 63, frameRate: 30 }),
      "Echo cine loop, 2.1 s",
    ],
    [
      "echo cine loop with no frame rate in the header",
      meta({ modality: "US", numberOfFrames: 40, frameRate: null }),
      "Echo cine loop",
    ],
    [
      "echo still frame",
      meta({ modality: "US", numberOfFrames: 1 }),
      "Echo still image",
    ],
    ["angiography run", meta({ modality: "XA" }), "Angiography run"],
    [
      "anything else, with a description",
      meta({ modality: "OT", seriesDescription: "Cardiac_Function_Global_Findings" }),
      "Cardiac_Function_Global_Findings",
    ],
    ["anything else, no description", meta({ modality: "OT" }), "OT"],
  ])("%s", (_name, input, expected) => {
    expect(seriesLabel(input)).toBe(expected);
  });
});

describe("seriesGroup", () => {
  it.each([
    ["report", meta({ modality: "SR" }), "report"],
    [
      "localizer",
      meta({ imageType: ["ORIGINAL", "PRIMARY", "LOCALIZER"] }),
      "localizer",
    ],
    [
      "snapshot",
      meta({
        imageType: ["DERIVED", "SECONDARY"],
        numberOfFrames: 1,
        photometric: "MONOCHROME2",
      }),
      "snapshot",
    ],
    [
      "analysis",
      meta({ imageType: ["DERIVED", "SECONDARY"], photometric: "RGB" }),
      "analysis",
    ],
    [
      "dose sheet groups as analysis, not snapshot",
      meta({
        imageType: ["DERIVED", "SECONDARY", "CT_SOM5", "PROT"],
        photometric: "MONOCHROME2",
        numberOfFrames: 1,
      }),
      "analysis",
    ],
    ["volume", meta({ modality: "CT", sliceThickness: 0.6 }), "volume"],
    ["images (US)", meta({ modality: "US" }), "images"],
    ["other (XA)", meta({ modality: "XA" }), "other"],
    ["other (fallback)", meta({ modality: "OT" }), "other"],
  ])("%s", (_name, input, expected) => {
    expect(seriesGroup(input)).toBe(expected);
  });
});

describe("readSopInstanceUid", () => {
  it("reads the SOP instance UID of a generated CT slice", () => {
    const bytes = buildMiniCtDicom({ instanceNumber: 7 });
    expect(readSopInstanceUid(new Uint8Array(bytes))).toBe(
      "1.2.826.0.1.3680043.8.498.spike.7",
    );
  });

  it("returns null for a non-Part-10 buffer", () => {
    expect(readSopInstanceUid(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
