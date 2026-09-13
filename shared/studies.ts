import type { MedicalDocument } from "./schema";
import { seriesGroup, seriesLabel, type SeriesGroup } from "./dicom-meta";
import { localDate } from "./upload-kinds";

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

const BASIC_TEXT_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.11";

export type ReportRow = {
  /** Stable across renders for the same group of records. */
  key: string;
  label: string;
  /** Total files across every record collapsed into this row. */
  count: number;
  /** The record `onView` should open for this row. */
  representative: MedicalDocument;
};

function reportLabel(record: MedicalDocument): string {
  if (record.dicomMeta?.sopClassUid === BASIC_TEXT_SR_SOP_CLASS) {
    // Until plan 05 renders SR content, a Basic Text SR has nothing to show
    // beyond its title — plain "Report" or "Report — <description>" reads
    // as broken rather than as "there's a written report here".
    return "Written report";
  }
  return record.dicomMeta ? seriesLabel(record.dicomMeta) : record.title;
}

/**
 * Collapses report records that are really the same report split across
 * several near-identical DICOM objects — matched by `seriesDescription` +
 * `seriesNumber` — into one row with a total file count. Order follows
 * first appearance in `records`.
 */
export function groupReports(records: MedicalDocument[]): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  const order: string[] = [];
  for (const record of records) {
    const meta = record.dicomMeta;
    const key = meta
      ? `${meta.seriesDescription}::${meta.seriesNumber ?? ""}`
      : `id:${record.id}`;
    const existing = rows.get(key);
    if (existing) {
      existing.count += record.fileCount;
    } else {
      rows.set(key, {
        key,
        label: reportLabel(record),
        count: record.fileCount,
        representative: record,
      });
      order.push(key);
    }
  }
  return order.map((key) => rows.get(key)!);
}

export type DocumentStatsFilter = {
  searchQuery: string;
  /** "all", or one of the ordinary document types (e.g. "lab_result"). */
  documentType: string;
};

export type DocumentStats = {
  /** Ordinary documents + studies, each counted as one item. */
  total: number;
  /** Items currently shown after the search/type filter. */
  filtered: number;
  /** Items dated in the current local calendar month. */
  thisMonth: number;
};

function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  if (!query) {
    return true;
  }
  const needle = query.toLowerCase();
  return fields.some((field) => (field ?? "").toLowerCase().includes(needle));
}

function documentMatchesFilter(
  record: MedicalDocument,
  filter: DocumentStatsFilter,
): boolean {
  const matchesType = filter.documentType === "all" || record.documentType === filter.documentType;
  return (
    matchesType &&
    matchesQuery(filter.searchQuery, record.title, record.description, record.doctorName, record.facilityName)
  );
}

function studyMatchesFilter(study: StudySummary, filter: DocumentStatsFilter): boolean {
  // A study is never one of the ordinary document types (lab_result,
  // prescription, ...), so picking a specific type filters every study out.
  if (filter.documentType !== "all") {
    return false;
  }
  const seriesText = Object.values(study.groups)
    .flat()
    .flatMap((series) => [series.title, series.dicomMeta?.seriesDescription]);
  return matchesQuery(filter.searchQuery, study.studyDescription, ...seriesText);
}

function isInCurrentLocalMonth(date: Date, now: Date): boolean {
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

/**
 * Counts for the Documents page stats row. `records` are ordinary
 * (non-DICOM) documents; a DICOM series is never counted here directly —
 * only via the `studies` it has already been grouped into (see
 * `groupIntoStudies`), so a 32-series study still counts as one item.
 */
export function documentStats(
  records: MedicalDocument[],
  studies: StudySummary[],
  filter: DocumentStatsFilter,
): DocumentStats {
  const now = new Date();
  const total = records.length + studies.length;
  const filtered =
    records.filter((record) => documentMatchesFilter(record, filter)).length +
    studies.filter((study) => studyMatchesFilter(study, filter)).length;
  const thisMonth =
    records.filter((record) => record.createdAt && isInCurrentLocalMonth(new Date(record.createdAt), now))
      .length +
    studies.filter((study) => study.documentDate && isInCurrentLocalMonth(localDate(study.documentDate), now))
      .length;
  return { total, filtered, thisMonth };
}
