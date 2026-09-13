/**
 * Which file of a series makes the best thumbnail. A single-file series
 * (a snapshot, a dose sheet) has nothing to choose from. A multi-slice
 * volume's first slice is usually the very top of the scan range — the
 * middle slice is mid-chest and actually shows the anatomy.
 */
export function thumbnailPosition(document: { fileCount: number }): number {
  return document.fileCount > 1 ? Math.floor(document.fileCount / 2) : 0;
}
