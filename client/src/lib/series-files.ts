import { filesListUrl, sourceKey, type FileSource } from "./file-source";
import { useFileSource } from "./file-source-context";
import { useQuery } from "@tanstack/react-query";

/**
 * One row of `GET /api/documents/:id/files` — just the fields the study
 * page's inline view/run strip needs (plan 13 section D) to label and count
 * a record's files without opening the viewer first.
 */
export type SeriesFileRow = {
  position: number;
  imageType: string[] | null;
  positionerPrimaryAngle: number | null;
  positionerSecondaryAngle: number | null;
  usRegionDataTypes: number[] | null;
  numberOfFrames: number | null;
  frameRate: number | null;
  frameIndex: { numberOfFrames: number } | null;
};

async function fetchSeriesFiles(source: FileSource, documentId: number): Promise<SeriesFileRow[]> {
  const response = await fetch(filesListUrl(source, documentId), {
    credentials: "include",
  });
  if (!response.ok) {
    return [];
  }
  return (await response.json()) as SeriesFileRow[];
}

/**
 * A record's file list, fetched only when `enabled` — the study page only
 * needs this for a "views"/"runs" record's inline strip (plan 13 section D);
 * every other record already has what it needs from `dicomMeta` alone.
 */
export function useSeriesFiles(documentId: number, enabled: boolean) {
  const source = useFileSource();
  return useQuery({
    queryKey: ["series-files", sourceKey(source), documentId],
    queryFn: () => fetchSeriesFiles(source, documentId),
    enabled,
  });
}
