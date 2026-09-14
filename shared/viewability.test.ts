import { describe, expect, it } from "vitest";
import type { DicomSeriesMeta } from "./dicom-meta";
import { DICOM_MIME } from "./upload-kinds";
import { viewabilityFromMeta } from "./viewability";

const BASIC_TEXT_SR = "1.2.840.10008.5.1.4.1.1.88.11";
const COMPREHENSIVE_SR = "1.2.840.10008.5.1.4.1.1.88.33";

function meta(overrides: Partial<DicomSeriesMeta> = {}): DicomSeriesMeta {
  return {
    studyInstanceUid: "study-1",
    seriesInstanceUid: "series-1",
    sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
    modality: "CT",
    studyDescription: "",
    seriesDescription: "",
    seriesNumber: null,
    rows: 512,
    columns: 512,
    numberOfFrames: 1,
    frameRate: null,
    photometric: "MONOCHROME2",
    transferSyntaxUid: "1.2.840.10008.1.2.4.70",
    sliceThickness: null,
    imageType: [],
    hasOverlay: false,
    ...overrides,
  };
}

describe("viewabilityFromMeta", () => {
  it("treats a non-DICOM record (pdf/image) as images", () => {
    expect(viewabilityFromMeta(null, "application/pdf")).toEqual({ kind: "images" });
    expect(viewabilityFromMeta(null, "image/png")).toEqual({ kind: "images" });
  });

  it("treats a DICOM record with a non-SR modality as images", () => {
    expect(viewabilityFromMeta(meta({ modality: "CT" }), DICOM_MIME)).toEqual({ kind: "images" });
    expect(viewabilityFromMeta(meta({ modality: "US" }), DICOM_MIME)).toEqual({ kind: "images" });
    expect(viewabilityFromMeta(meta({ modality: "XA" }), DICOM_MIME)).toEqual({ kind: "images" });
  });

  it("assumes a Basic Text SR is an empty report unless a parse says otherwise", () => {
    const result = viewabilityFromMeta(
      meta({ modality: "SR", sopClassUid: BASIC_TEXT_SR, seriesDescription: "Radiology Report" }),
      DICOM_MIME,
    );
    expect(result.kind).toBe("empty-report");
    expect((result as { reason: string }).reason).toBeTruthy();
  });

  it("treats a Comprehensive SR matching /evidence documents/i as opaque", () => {
    const result = viewabilityFromMeta(
      meta({
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Cardiac Function — Evidence Documents",
      }),
      DICOM_MIME,
    );
    expect(result).toEqual({
      kind: "opaque",
      reason: "scanner analysis session (vendor format)",
    });
  });

  it("is case-insensitive when matching the evidence documents phrase", () => {
    const result = viewabilityFromMeta(
      meta({
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "EVIDENCE DOCUMENTS",
      }),
      DICOM_MIME,
    );
    expect(result.kind).toBe("opaque");
  });

  it("treats a Comprehensive SR without the evidence documents phrase as a report", () => {
    const result = viewabilityFromMeta(
      meta({
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "CT Coronary",
      }),
      DICOM_MIME,
    );
    expect(result).toEqual({ kind: "report" });
  });

  it("treats any other SR SOP class as a report", () => {
    const result = viewabilityFromMeta(
      meta({ modality: "SR", sopClassUid: "1.2.840.10008.5.1.4.1.1.88.22" }),
      DICOM_MIME,
    );
    expect(result).toEqual({ kind: "report" });
  });
});
