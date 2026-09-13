import type { MedicalDocument } from "./schema";
import { seriesGroup, seriesLabel, type SeriesGroup } from "./dicom-meta";

export type StudySummary = {
  studyInstanceUid: string;
  modalities: string[];
  studyDescription: string;
  documentDate: string;
  seriesCount: number;
  fileCount: number;
  totalBytes: number;
  primary: MedicalDocument | null;
  groups: Record<SeriesGroup, MedicalDocument[]>;
};

function emptyGroups(): Record<SeriesGroup, MedicalDocument[]> {
  return {
    volume: [],
    snapshot: [],
    analysis: [],
    report: [],
    localizer: [],
    other: [],
  };
}

/**
 * Records without `dicomMeta` are not studies and are dropped. One record is
 * one series (see shared/schema.ts); a study is every record sharing a
 * studyInstanceUid.
 */
export function groupIntoStudies(records: MedicalDocument[]): StudySummary[] {
  const byStudy = new Map<string, MedicalDocument[]>();
  for (const record of records) {
    if (!record.dicomMeta) {
      continue;
    }
    const series = byStudy.get(record.dicomMeta.studyInstanceUid) ?? [];
    series.push(record);
    byStudy.set(record.dicomMeta.studyInstanceUid, series);
  }

  return Array.from(byStudy.entries()).map(([studyInstanceUid, series]) =>
    summarize(studyInstanceUid, series),
  );
}

function summarize(
  studyInstanceUid: string,
  series: MedicalDocument[],
): StudySummary {
  const groups = emptyGroups();
  const modalities: string[] = [];
  const seenModalities = new Set<string>();
  const descriptionCounts = new Map<string, number>();
  let fileCount = 0;
  let totalBytes = 0;
  let documentDate = series[0]?.documentDate ?? "";

  for (const record of series) {
    const meta = record.dicomMeta!;
    if (!seenModalities.has(meta.modality)) {
      seenModalities.add(meta.modality);
      modalities.push(meta.modality);
    }
    if (meta.studyDescription) {
      descriptionCounts.set(
        meta.studyDescription,
        (descriptionCounts.get(meta.studyDescription) ?? 0) + 1,
      );
    }
    fileCount += record.fileCount;
    totalBytes += Number(record.fileSize) || 0;
    if (record.documentDate < documentDate) {
      documentDate = record.documentDate;
    }
    groups[seriesGroup(meta)].push(record);
  }

  return {
    studyInstanceUid,
    modalities,
    studyDescription: mostCommonDescription(descriptionCounts),
    documentDate,
    seriesCount: series.length,
    fileCount,
    totalBytes,
    primary: primarySeries(series),
    groups,
  };
}

function mostCommonDescription(counts: Map<string, number>): string {
  let label = "";
  let best = 0;
  for (const [description, count] of Array.from(counts)) {
    if (count > best) {
      label = description;
      best = count;
    }
  }
  return label;
}

/**
 * Among the "volume" records, the one with the most files whose label
 * mentions the best diastolic phase; else the one with the most files
 * overall; else null. This is what a study card opens by default.
 */
export function primarySeries(records: MedicalDocument[]): MedicalDocument | null {
  const volumes = records.filter(
    (record) => record.dicomMeta && seriesGroup(record.dicomMeta) === "volume",
  );
  if (volumes.length === 0) {
    return null;
  }
  const diastolic = volumes.filter((record) =>
    seriesLabel(record.dicomMeta!).includes("best diastole"),
  );
  const pool = diastolic.length > 0 ? diastolic : volumes;
  return pool.reduce((best, record) =>
    record.fileCount > best.fileCount ? record : best,
  );
}
