import { useQuery } from "@tanstack/react-query";
import type { MedicalDocument } from "@shared/schema";

type FileFrameRow = { frameIndex: { numberOfFrames: number } | null };

/**
 * Whether a record's file count is "runs" of a cine acquisition, not plain
 * "images" (plan 12) — an XA record whose first file already carries more
 * than one frame. Cheap (reads the record's own already-fetched dicomMeta),
 * so callers use it to decide whether the network fetch in
 * `useMultiFrameSummary` below is worth doing at all.
 */
export function isMultiFrameRecord(record: MedicalDocument): boolean {
  return record.dicomMeta?.modality === "XA" && (record.dicomMeta?.numberOfFrames ?? 1) > 1;
}

async function totalFramesOf(documentId: number): Promise<number> {
  const response = await fetch(`/api/documents/${documentId}/files`, {
    credentials: "include",
  });
  if (!response.ok) {
    return 0;
  }
  const files = (await response.json()) as FileFrameRow[];
  return files.reduce((sum, file) => sum + (file.frameIndex?.numberOfFrames ?? 0), 0);
}

export type MultiFrameSummary = { fileCount: number; totalFrames: number };

/**
 * "N runs · M frames" totals (see shared/studies.ts's recordFileCountLabel)
 * for the multi-frame records among `records` — every other kind of record
 * is ignored. `fileCount` sums straight from what's already loaded;
 * `totalFrames` costs one GET .../files per candidate record (its own
 * frameIndex.numberOfFrames per file, plan 12 — metadata only, never a
 * file's pixel bytes), summed once every candidate has answered. Null
 * while there is nothing to summarize, or while that fetch is in flight —
 * callers keep their default "N images" wording in that case.
 */
export function useMultiFrameSummary(records: MedicalDocument[]): MultiFrameSummary | null {
  const candidates = records.filter(isMultiFrameRecord);
  const ids = candidates.map((record) => record.id);
  const { data: totalFrames } = useQuery({
    queryKey: ["multi-frame-total", ids],
    queryFn: async () => {
      const totals = await Promise.all(candidates.map((record) => totalFramesOf(record.id)));
      return totals.reduce((sum, total) => sum + total, 0);
    },
    enabled: candidates.length > 0,
  });
  if (candidates.length === 0 || totalFrames == null) {
    return null;
  }
  return {
    fileCount: candidates.reduce((sum, record) => sum + record.fileCount, 0),
    totalFrames,
  };
}
