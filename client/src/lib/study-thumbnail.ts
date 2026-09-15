import type { DicomSeriesMeta } from "@shared/dicom-meta";
import { seriesKind } from "@shared/series-kind";

/**
 * Which file of a series makes the best thumbnail. A single-file series
 * (a snapshot, a dose sheet) has nothing to choose from. A multi-slice
 * volume's first slice is usually the very top of the scan range — the
 * middle slice is mid-chest and actually shows the anatomy. A record whose
 * files are separate views (echo) or runs (angiography) is different: each
 * file is its own picture, the first is as good a preview as any, and it is
 * the one position the series metadata can vouch for as range-readable
 * (client/src/lib/thumbnail-frame-source.ts) — picking the middle run of a
 * cath record meant fetching a 90 MB file whole for a thumbnail that then
 * couldn't be drawn.
 */
export function thumbnailPosition(document: {
  fileCount: number;
  dicomMeta?: Pick<DicomSeriesMeta, "modality"> | null;
}): number {
  if (document.fileCount <= 1) {
    return 0;
  }
  if (document.dicomMeta) {
    const kind = seriesKind(document.dicomMeta, document.fileCount);
    if (kind === "views" || kind === "runs") {
      return 0;
    }
  }
  return Math.floor(document.fileCount / 2);
}
