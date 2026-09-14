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
const COMPREHENSIVE_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.33";

/**
 * Vendor-private SR objects on the reference disc (e.g. the Cardiac
 * Function and CT Coronary analyses' embedded evidence images) carry this
 * phrase in their series description. Whether their content tree is
 * actually readable is only known once the file is parsed (out of scope
 * here — see plan 09); this is the cheap proxy.
 */
const EVIDENCE_DOCUMENTS_RE = /evidence documents/i;
/** Separator punctuation left dangling once the phrase above is stripped out. */
const DANGLING_SEPARATOR_RE = /^[\s\-–—:]+|[\s\-–—:]+$/g;

const UNREADABLE_ANALYSIS_LABEL = "Analysis data";

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
  const meta = record.dicomMeta;
  if (meta?.sopClassUid === BASIC_TEXT_SR_SOP_CLASS) {
    // Until plan 05 renders SR content, a Basic Text SR has nothing to show
    // beyond its title — plain "Report" or "Report — <description>" reads
    // as broken rather than as "there's a written report here".
    return "Written report";
  }
  if (
    meta?.sopClassUid === COMPREHENSIVE_SR_SOP_CLASS &&
    EVIDENCE_DOCUMENTS_RE.test(meta.seriesDescription)
  ) {
    // A vendor-private blob (no readable measurements or text) — "Report —
    // Evidence Documents" reads as a broken report rather than as "there's
    // nothing to read here, just embedded images".
    const rest = meta.seriesDescription
      .replace(EVIDENCE_DOCUMENTS_RE, "")
      .replace(DANGLING_SEPARATOR_RE, "");
    return rest ? `${UNREADABLE_ANALYSIS_LABEL} — ${rest}` : UNREADABLE_ANALYSIS_LABEL;
  }
  return meta ? seriesLabel(meta) : record.title;
}

function isUnreadableAnalysisRow(row: ReportRow): boolean {
  return row.label === UNREADABLE_ANALYSIS_LABEL || row.label.startsWith(`${UNREADABLE_ANALYSIS_LABEL} — `);
}

/**
 * Collapses report records that are really the same report split across
 * several near-identical DICOM objects — matched by `seriesDescription` +
 * `seriesNumber` — into one row with a total file count. Order follows
 * first appearance in `records`.
 *
 * Both parts of the key must be non-blank to collapse: a blank
 * `seriesDescription` and a null `seriesNumber` are not "the same" report,
 * they're just two records with nothing to distinguish them, so each keeps
 * its own row (keyed by record id instead).
 *
 * Rows labelled as unreadable analysis data (see `reportLabel`) sort after
 * every readable row, so a report with actual findings never has to be
 * scrolled past to reach it — otherwise, first-appearance order is kept.
 */
export function groupReports(records: MedicalDocument[]): ReportRow[] {
  const rows = new Map<string, ReportRow>();
  const order: string[] = [];
  for (const record of records) {
    const meta = record.dicomMeta;
    const seriesDescription = meta?.seriesDescription ?? "";
    const seriesNumber = meta?.seriesNumber ?? "";
    const key =
      meta && seriesDescription !== "" && seriesNumber !== ""
        ? `${seriesDescription}::${seriesNumber}`
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
  const ordered = order.map((key) => rows.get(key)!);
  return [
    ...ordered.filter((row) => !isUnreadableAnalysisRow(row)),
    ...ordered.filter((row) => isUnreadableAnalysisRow(row)),
  ];
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
 * The studies shown after the search/type filter — a study is kept when any
 * of its series matches. Used both for the "Filtered" stat tile and for the
 * Imaging Studies grid so the two never disagree.
 */
export function filterStudies(
  studies: StudySummary[],
  filter: DocumentStatsFilter,
): StudySummary[] {
  return studies.filter((study) => studyMatchesFilter(study, filter));
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
    filterStudies(studies, filter).length;
  const thisMonth =
    records.filter((record) => record.createdAt && isInCurrentLocalMonth(new Date(record.createdAt), now))
      .length +
    studies.filter((study) => study.documentDate && isInCurrentLocalMonth(localDate(study.documentDate), now))
      .length;
  return { total, filtered, thisMonth };
}

/** Every series of a study, in the order the study page shows its sections. */
const GROUP_ORDER: SeriesGroup[] = [
  "volume",
  "snapshot",
  "analysis",
  "report",
  "localizer",
  "other",
];

export function studySeries(study: StudySummary): MedicalDocument[] {
  return GROUP_ORDER.flatMap((group) => study.groups[group]);
}

/**
 * One entry per thing a person would call a document: an ordinary upload, or
 * a whole study. A study's series are its contents, never items of their own.
 */
export type DocumentItem =
  | { kind: "document"; record: MedicalDocument }
  | { kind: "study"; study: StudySummary };

/**
 * Splits raw records the way every surface should read them: a record with
 * `dicomMeta` is a series and belongs to a study, everything else is an
 * ordinary document. Nothing appears in both halves.
 */
export function splitDocuments(records: MedicalDocument[]): {
  ordinary: MedicalDocument[];
  studies: StudySummary[];
} {
  return {
    ordinary: records.filter((record) => !record.dicomMeta),
    studies: groupIntoStudies(records),
  };
}

/** The date an item is filed under: a study takes its earliest series' date. */
export function documentItemDate(item: DocumentItem): string {
  return item.kind === "study" ? item.study.documentDate : item.record.documentDate;
}

/** Stable list key, so a list never has to fall back to an index. */
export function documentItemKey(item: DocumentItem): string {
  return item.kind === "study"
    ? `study-${item.study.studyInstanceUid}`
    : `document-${item.record.id}`;
}

/**
 * The one list every surface counts, lists and links: newest first, one
 * entry per ordinary document and one per study — never one per series.
 */
export function listDocumentItems(records: MedicalDocument[]): DocumentItem[] {
  const { ordinary, studies } = splitDocuments(records);
  const items: DocumentItem[] = [
    ...ordinary.map((record): DocumentItem => ({ kind: "document", record })),
    ...studies.map((study): DocumentItem => ({ kind: "study", study })),
  ];
  return items.sort((a, b) => documentItemDate(b).localeCompare(documentItemDate(a)));
}

/**
 * The document ids behind a selection of items — a study contributes every
 * one of its series ids, since the share API still speaks in document ids.
 * Each id appears once, in item order.
 */
export function documentIdsForItems(items: DocumentItem[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const item of items) {
    const records = item.kind === "study" ? studySeries(item.study) : [item.record];
    for (const record of records) {
      if (!seen.has(record.id)) {
        seen.add(record.id);
        ids.push(record.id);
      }
    }
  }
  return ids;
}

type ModalityLabel = {
  modality: string;
  /** First matching pattern wins; tested against the study description. */
  rules: Array<[RegExp, string]>;
  fallback: string;
};

/**
 * `CorCTA` is the scanner's own abbreviation for a coronary CT angiogram and
 * turns up in study and series descriptions alike, so it reads as
 * "coronary" alongside the plain words.
 */
const MODALITY_LABELS: ModalityLabel[] = [
  {
    modality: "CT",
    rules: [[/coron|cardiac|corcta/i, "Coronary CT angiography"]],
    fallback: "CT scan",
  },
  {
    modality: "US",
    rules: [[/eco|echo|cardio/i, "Echocardiogram"]],
    fallback: "Ultrasound",
  },
  {
    modality: "XA",
    rules: [[/cate|coron|cardiac/i, "Cardiac catheterization"]],
    fallback: "Angiography",
  },
];

/** SR and friends describe a study's paperwork, never the study itself. */
const NON_IMAGING_MODALITIES = new Set(["SR", "PR", "KO", "DOC"]);

function imagingModality(study: StudySummary): string {
  return (
    study.modalities.find((modality) => !NON_IMAGING_MODALITIES.has(modality)) ??
    study.modalities[0] ??
    ""
  );
}

/**
 * What to call a study in a card, a header or a timeline row: a human label
 * built from its imaging modality and description, falling back to the raw
 * description and then to the bare modality. Keep the raw description
 * alongside as secondary text — this label drops its detail on purpose.
 */
export function studyLabel(study: StudySummary): string {
  const description = study.studyDescription;
  const labeled = study.modalities
    .map((modality) => MODALITY_LABELS.find((entry) => entry.modality === modality))
    .find((entry): entry is ModalityLabel => entry !== undefined);
  if (labeled) {
    const matched = labeled.rules.find(([pattern]) => pattern.test(description));
    return matched ? matched[1] : labeled.fallback;
  }
  return description || imagingModality(study);
}
