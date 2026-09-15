/**
 * One name per kind of record a study page/viewer has to navigate (plan 13).
 * The DICOM series/document grouping in shared/dicom-meta.ts (SeriesGroup —
 * "volume" | "images" | "snapshot" | ...) answers "which section of the
 * study page does this go in"; SeriesKind answers a narrower question that
 * only matters for the *navigation strip* a record needs: is one file a
 * position in a volume, a whole view (echocardiogram), a whole run
 * (angiography), or is there only one file at all.
 */
import type { DicomSeriesMeta } from "./dicom-meta";
import { cineDuration } from "./dicom-meta";

export type SeriesKind = "volume" | "phases" | "views" | "runs" | "single" | "report";

/**
 * `fileCount` is the record's file count (shared/schema.ts MedicalDocument's
 * `fileCount`, or the length of its files list) — not part of
 * `DicomSeriesMeta`, which describes only the first file. `hasPhases` comes
 * from `detectPhases` (shared/phases.ts) having found more than one phase in
 * that file list; it only matters for CT/MR.
 */
export function seriesKind(
  meta: Pick<DicomSeriesMeta, "modality">,
  fileCount: number,
  hasPhases = false,
): SeriesKind {
  if (meta.modality === "SR") {
    return "report";
  }
  if (fileCount <= 1) {
    return "single";
  }
  if (meta.modality === "US") {
    return "views";
  }
  if (meta.modality === "XA") {
    return "runs";
  }
  return hasPhases ? "phases" : "volume";
}

/** Colour Doppler regions (SequenceOfUltrasoundRegions RegionDataType) carry these values. */
const COLOUR_DOPPLER_REGION_DATA_TYPES = new Set([2, 3]);

export type ViewLabelInput = {
  imageType: string[];
  usRegionDataTypes: number[];
  numberOfFrames: number;
  frameRate: number | null;
};

/**
 * The label under one thumbnail of an ultrasound record's view strip: what
 * kind of acquisition this file actually is, derived from its own header —
 * "2-D", "Colour Doppler", "M-mode", "Still", falling back to "Loop N ·
 * duration" for a cine loop whose ImageType doesn't say more specifically.
 */
export function viewLabel(file: ViewLabelInput): string {
  if (file.usRegionDataTypes.some((type) => COLOUR_DOPPLER_REGION_DATA_TYPES.has(type))) {
    return "Colour Doppler";
  }
  if (file.imageType.some((value) => /DOPPLER/i.test(value))) {
    return "Colour Doppler";
  }
  if (file.imageType.some((value) => /M[\s-]?MODE/i.test(value))) {
    return "M-mode";
  }
  if (file.numberOfFrames <= 1) {
    return "Still";
  }
  if (file.imageType.some((value) => /^2D$/i.test(value))) {
    return "2-D";
  }
  const duration = cineDuration(file.numberOfFrames, file.frameRate);
  return duration ? `Loop ${file.numberOfFrames} · ${duration}` : `Loop ${file.numberOfFrames}`;
}

export type RunLabelInput = {
  positionerPrimaryAngle: number | null;
  positionerSecondaryAngle: number | null;
  numberOfFrames: number;
};

/**
 * Positioner Primary Angle (0018,1510) per DICOM PS3.3 C.8.7.5: positive
 * means the detector is to the patient's left (LAO), negative to the right
 * (RAO). Not a vendor convention — the standard defines the sign.
 */
function primaryAngleLabel(angle: number): string {
  return `${angle >= 0 ? "LAO" : "RAO"} ${Math.round(Math.abs(angle))}°`;
}

/**
 * Positioner Secondary Angle (0018,1511) per the same section: positive is
 * cranial (CRA), negative caudal (CAU).
 */
function secondaryAngleLabel(angle: number): string {
  return `${angle >= 0 ? "CRA" : "CAU"} ${Math.round(Math.abs(angle))}°`;
}

/**
 * The label under one thumbnail of an angiography record's run strip:
 * its projection angles when the header carries them ("RAO 30° / CRA 20°"),
 * else "Run <n> · <frames> frames" — `runNumber` is the file's 1-based
 * position among the record's runs, not a DICOM tag.
 */
export function runLabel(file: RunLabelInput, runNumber: number): string {
  if (file.positionerPrimaryAngle != null && file.positionerSecondaryAngle != null) {
    return `${primaryAngleLabel(file.positionerPrimaryAngle)} / ${secondaryAngleLabel(file.positionerSecondaryAngle)}`;
  }
  const frames = file.numberOfFrames === 1 ? "1 frame" : `${file.numberOfFrames} frames`;
  return `Run ${runNumber} · ${frames}`;
}
