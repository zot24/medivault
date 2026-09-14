import type { DicomSeriesMeta } from "./dicom-meta";
import { DICOM_MIME } from "./upload-kinds";

/**
 * Whether a series/document has anything a person can look at: the viewer
 * draws pixels (`images`), the SR view shows readable findings (`report`),
 * or there's nothing to open — either the disc's report entry is genuinely
 * empty (`empty-report`) or it holds only private/binary content
 * (`opaque`). A row for the latter two shows a plain sentence instead of a
 * View button (plan 11).
 */
export type Viewability =
  | { kind: "images" }
  | { kind: "report" }
  | { kind: "empty-report"; reason: string }
  | { kind: "opaque"; reason: string };

/** SR SOP classes are 1.2.840.10008.5.1.4.1.1.88.* (Basic Text, Comprehensive, ...). */
const BASIC_TEXT_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.11";
const COMPREHENSIVE_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.33";

/**
 * Vendor-private SR objects on the reference disc (e.g. the Cardiac
 * Function and CT Coronary analyses' embedded evidence images) carry this
 * phrase in their series description — see shared/studies.ts's
 * `reportLabel`, which uses the same proxy to relabel these rows.
 */
const EVIDENCE_DOCUMENTS_RE = /evidence documents/i;

/**
 * Reason text for an SR with zero content items — shared with
 * `shared/dicom-sr.ts`'s post-parse `srViewability`, so a deep-linked
 * viewer that re-derives viewability from the actual parse (plan 11, part
 * C) reads the same sentence as the row that used this cheap guess.
 */
export const EMPTY_REPORT_REASON = "the disc's report entry is empty";
/**
 * Reason text for an SR with only private/binary content — see
 * `EMPTY_REPORT_REASON` above.
 */
export const OPAQUE_VENDOR_SESSION_REASON = "scanner analysis session (vendor format)";

/**
 * Decides viewability from the record alone — cheap, never reads file
 * bytes. Rules: non-DICOM (pdf/image) or a DICOM record whose modality
 * isn't SR draws in the existing image/PDF viewers; a Basic Text SR is
 * assumed to have no content (three of three on the reference disc parse to
 * zero content items — `srViewability` refines this once the file is
 * actually parsed); a Comprehensive SR whose series description matches the
 * vendor's own "evidence documents" phrase is assumed to hold only private
 * binary content; every other SR is assumed to have a readable report.
 */
export function viewabilityFromMeta(
  meta: DicomSeriesMeta | null,
  mimeType: string,
): Viewability {
  if (mimeType !== DICOM_MIME || !meta || meta.modality !== "SR") {
    return { kind: "images" };
  }
  // Recorded at upload from the actual content tree (plan 11 fix): the
  // description heuristics below only cover records uploaded before that.
  if (meta.srContent === "report") {
    return { kind: "report" };
  }
  if (meta.srContent === "empty-report") {
    return { kind: "empty-report", reason: EMPTY_REPORT_REASON };
  }
  if (meta.srContent === "opaque") {
    return { kind: "opaque", reason: OPAQUE_VENDOR_SESSION_REASON };
  }
  if (meta.sopClassUid === BASIC_TEXT_SR_SOP_CLASS) {
    return { kind: "empty-report", reason: EMPTY_REPORT_REASON };
  }
  if (
    meta.sopClassUid === COMPREHENSIVE_SR_SOP_CLASS &&
    EVIDENCE_DOCUMENTS_RE.test(meta.seriesDescription)
  ) {
    return { kind: "opaque", reason: OPAQUE_VENDOR_SESSION_REASON };
  }
  return { kind: "report" };
}
