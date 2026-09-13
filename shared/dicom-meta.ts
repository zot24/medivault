import dicomParser from "dicom-parser";
import { isPart10 } from "./upload-kinds";

/**
 * Everything the app needs to group and label a DICOM series. Deliberately
 * excludes PatientName, PatientID, PatientBirthDate, AccessionNumber,
 * InstitutionName, referring/performing physician, and any date tag — see the
 * key-list test in dicom-meta.test.ts.
 */
export type DicomSeriesMeta = {
  studyInstanceUid: string; // (0020,000D)
  seriesInstanceUid: string; // (0020,000E)
  sopClassUid: string; // (0008,0016)
  modality: string; // (0008,0060) CT, US, XA, SR, ...
  studyDescription: string; // (0008,1030)
  seriesDescription: string; // (0008,103E)
  seriesNumber: number | null; // (0020,0011)
  rows: number | null;
  columns: number | null;
  numberOfFrames: number; // (0028,0008), default 1
  photometric: string; // (0028,0004)
  transferSyntaxUid: string; // (0002,0010)
  sliceThickness: number | null; // (0018,0050)
  imageType: string[]; // (0008,0008) split on backslash
  hasOverlay: boolean; // any (60xx,3000) present
};

export type SeriesGroup =
  | "volume"
  | "snapshot"
  | "analysis"
  | "report"
  | "localizer"
  | "other";

const OVERLAY_ELEMENT = 0x3000;
const OVERLAY_GROUP_MIN = 0x6000;
const OVERLAY_GROUP_MAX = 0x601e;

/**
 * Reads series metadata from one file of a series. A record's metadata is
 * taken from its first file only (see `uploadOwnedDocument`); appending more
 * files never changes it.
 */
export function readSeriesMeta(bytes: Uint8Array): DicomSeriesMeta | null {
  if (!isPart10(bytes)) {
    return null;
  }
  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const studyInstanceUid = dataSet.string("x0020000d");
    const seriesInstanceUid = dataSet.string("x0020000e");
    const sopClassUid = dataSet.string("x00080016");
    if (!studyInstanceUid || !seriesInstanceUid || !sopClassUid) {
      return null;
    }
    return {
      studyInstanceUid,
      seriesInstanceUid,
      sopClassUid,
      modality: trimmed(dataSet.string("x00080060")),
      studyDescription: trimmed(dataSet.string("x00081030")),
      seriesDescription: trimmed(dataSet.string("x0008103e")),
      seriesNumber: firstInt(dataSet.string("x00200011")),
      rows: dataSet.uint16("x00280010") ?? null,
      columns: dataSet.uint16("x00280011") ?? null,
      numberOfFrames: firstInt(dataSet.string("x00280008")) ?? 1,
      photometric: trimmed(dataSet.string("x00280004")),
      transferSyntaxUid: dataSet.string("x00020010") ?? "",
      sliceThickness: firstFloat(dataSet.string("x00180050")),
      imageType: splitBackslash(dataSet.string("x00080008")),
      hasOverlay: hasOverlayElement(dataSet.elements),
    };
  } catch {
    return null;
  }
}

/**
 * Reads one file's SOPInstanceUID (0008,0018) — stored per file so an SR's
 * IMAGE content items can be resolved to a sibling record's file. A minimal
 * stand-in for the fuller per-file `readFileMeta` (instanceNumber,
 * sliceLocation, phase) that plan 04 adds; merge into that when it lands.
 */
export function readSopInstanceUid(bytes: Uint8Array): string | null {
  if (!isPart10(bytes)) {
    return null;
  }
  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const sopInstanceUid = dataSet.string("x00080018");
    return sopInstanceUid ? trimmed(sopInstanceUid) : null;
  } catch {
    return null;
  }
}

function trimmed(raw: string | undefined): string {
  return (raw ?? "").trim();
}

function splitBackslash(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split("\\")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * First value of a DS/IS element. Scanners often write several in one
 * element ("345\\-600"); Number() on the raw string yields NaN. A present
 * but blank or whitespace-only value (Number("") === 0) means "no value",
 * not zero.
 */
function firstFloat(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const first = raw.split("\\")[0].trim();
  if (first === "") {
    return null;
  }
  const value = Number(first);
  return Number.isFinite(value) ? value : null;
}

function firstInt(raw: string | undefined): number | null {
  const value = firstFloat(raw);
  return value == null ? null : Math.trunc(value);
}

function hasOverlayElement(elements: Record<string, unknown>): boolean {
  for (const key of Object.keys(elements)) {
    const group = parseInt(key.slice(1, 5), 16);
    const element = parseInt(key.slice(5, 9), 16);
    if (
      element === OVERLAY_ELEMENT &&
      group >= OVERLAY_GROUP_MIN &&
      group <= OVERLAY_GROUP_MAX &&
      group % 2 === 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Human label for a series, in order of specificity. Keep the raw
 * `seriesDescription` visible as secondary text alongside this.
 */
export function seriesLabel(meta: DicomSeriesMeta): string {
  const description = meta.seriesDescription;
  if (meta.modality === "SR") {
    return description ? `Report — ${description}` : "Report";
  }
  if (meta.imageType.includes("LOCALIZER")) {
    return "Scout image";
  }
  if (isSecondarySnapshot(meta)) {
    const phase = phaseOf(description);
    return phase ? `Measurement snapshot, ${phase} % phase` : "Measurement snapshot";
  }
  if (isSecondaryAnalysis(meta)) {
    return "Analysis charts";
  }
  if (meta.modality === "CT" && meta.sliceThickness != null) {
    let label = `CT volume, ${meta.sliceThickness} mm`;
    if (/BestDiast/.test(description)) {
      label += ", best diastole";
    } else if (/BestSyst/.test(description)) {
      label += ", best systole";
    }
    if (/\d+\s*-\s*\d+\s?%/.test(description)) {
      label += ", multi-phase";
    }
    return label;
  }
  if (meta.modality === "US") {
    return meta.numberOfFrames > 1 ? "Echo cine loop" : "Echo still image";
  }
  if (meta.modality === "XA") {
    return "Angiography run";
  }
  return description || meta.modality;
}

/** Same tests as `seriesLabel`, collapsed to the section a series belongs in. */
export function seriesGroup(meta: DicomSeriesMeta): SeriesGroup {
  if (meta.modality === "SR") {
    return "report";
  }
  if (meta.imageType.includes("LOCALIZER")) {
    return "localizer";
  }
  if (isSecondarySnapshot(meta)) {
    return "snapshot";
  }
  if (isSecondaryAnalysis(meta)) {
    return "analysis";
  }
  if (meta.modality === "CT" && meta.sliceThickness != null) {
    return "volume";
  }
  return "other";
}

function isMonochrome(photometric: string): boolean {
  return photometric === "" || photometric.startsWith("MONOCHROME");
}

function isSecondarySnapshot(meta: DicomSeriesMeta): boolean {
  return (
    meta.imageType.includes("SECONDARY") &&
    meta.numberOfFrames === 1 &&
    isMonochrome(meta.photometric)
  );
}

function isSecondaryAnalysis(meta: DicomSeriesMeta): boolean {
  return meta.imageType.includes("SECONDARY") && meta.photometric === "RGB";
}

function phaseOf(description: string): string | null {
  const match = /(\d+)\s?%/.exec(description);
  return match ? match[1] : null;
}
