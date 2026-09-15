import {
  readFileMeta,
  readSeriesMeta,
  readStudyDate,
  seriesGroup,
  seriesLabel,
  type DicomSeriesMeta,
  type SeriesGroup,
} from "./dicom-meta";
import { studyLabel } from "./studies";
import { isPart10 } from "./upload-kinds";
import { viewabilityFromMeta, type Viewability } from "./viewability";

/**
 * One file from a chosen folder, as far as `planImport` needs it: enough
 * bytes to sniff and parse DICOM headers, and the file's real total size
 * (the head is not the whole file — see IMPORT_HEAD_BYTES). `path` is only
 * ever shown to a person (a skip reason, a file's display name) or used to
 * look the real File object back up client-side; it plays no part in
 * grouping, which is entirely content-based (studyInstanceUid /
 * seriesInstanceUid read from the file itself).
 */
export type ImportSourceFile = {
  path: string;
  size: number;
  head: Uint8Array;
};

/**
 * Bytes read from the front of each file before it's classified: enough for
 * every tag readSeriesMeta/readFileMeta/readStudyDate read, all of which
 * come well before pixel data (plan 15).
 */
export const IMPORT_HEAD_BYTES = 4096;

/** Every DICOM series document created from a series gets this documentType — no other type applies to imaging. */
const IMPORT_DOCUMENT_TYPE = "x_ray";

export type PlannedFile = {
  path: string;
  size: number;
  instanceNumber: number | null;
};

export type PlannedSeries = {
  seriesInstanceUid: string;
  /** Human label, following the same rules a document card uses once uploaded (shared/dicom-meta.ts). */
  label: string;
  documentType: string;
  /** "YYYY-MM-DD": this series' first file's StudyDate, or the fallback `today` when absent. */
  documentDate: string;
  meta: DicomSeriesMeta;
  group: SeriesGroup;
  viewability: Viewability;
  /** Ordered for upload: by instanceNumber, falling back to arrival order for files that lack one. */
  files: PlannedFile[];
  fileCount: number;
  totalBytes: number;
  /** Checkbox default: on for a series with something to view, off otherwise (the box itself is the "include anyway" toggle). */
  selectedByDefault: boolean;
};

export type PlannedStudy = {
  studyInstanceUid: string;
  /** Human label, following the same rules a study card uses once uploaded (shared/studies.ts's studyLabel). */
  label: string;
  studyDescription: string;
  modalities: string[];
  /** Earliest of its series' documentDate values. */
  documentDate: string;
  series: PlannedSeries[];
  seriesCount: number;
  fileCount: number;
  totalBytes: number;
};

export type SkippedFile = {
  path: string;
  reason: string;
};

export type ImportPlanTotals = {
  studies: number;
  series: number;
  files: number;
  bytes: number;
};

export type ImportPlan = {
  studies: PlannedStudy[];
  skipped: SkippedFile[];
  totals: ImportPlanTotals;
};

export type PlanImportOptions = {
  /** "YYYY-MM-DD" used as a series' documentDate when its files carry no StudyDate. Defaults to the real today. */
  today?: string;
};

const NOT_DICOM_REASON = "not a Part-10 DICOM file";
const UNREADABLE_REASON = "DICOM header could not be read";

type SeriesAccumulator = {
  meta: DicomSeriesMeta;
  studyDate: string | null;
  files: (PlannedFile & { fileArrivalIndex: number })[];
  totalBytes: number;
};

type StudyAccumulator = {
  studyInstanceUid: string;
  series: Map<string, SeriesAccumulator>;
  seriesOrder: string[];
};

/**
 * Builds the preview tree a person sees before importing a folder: every
 * Part-10 DICOM file grouped study -> series, labeled and scored for
 * viewability exactly as an already-uploaded record would be (plan 10/11's
 * rules), with everything else listed as skipped. Pure and synchronous —
 * reading file bytes off disk happens client-side before this is called.
 */
export function planImport(
  files: ImportSourceFile[],
  options: PlanImportOptions = {},
): ImportPlan {
  const today = options.today ?? new Date().toISOString().slice(0, 10);
  const studies = new Map<string, StudyAccumulator>();
  const studyOrder: string[] = [];
  const skipped: SkippedFile[] = [];

  files.forEach((file, arrivalIndex) => {
    if (!isPart10(file.head)) {
      skipped.push({ path: file.path, reason: NOT_DICOM_REASON });
      return;
    }
    const meta = readSeriesMeta(file.head);
    if (!meta) {
      skipped.push({ path: file.path, reason: UNREADABLE_REASON });
      return;
    }
    const fileMeta = readFileMeta(file.head);
    const studyDate = readStudyDate(file.head);

    let study = studies.get(meta.studyInstanceUid);
    if (!study) {
      study = { studyInstanceUid: meta.studyInstanceUid, series: new Map(), seriesOrder: [] };
      studies.set(meta.studyInstanceUid, study);
      studyOrder.push(meta.studyInstanceUid);
    }

    let series = study.series.get(meta.seriesInstanceUid);
    if (!series) {
      // The record's metadata is taken from its first file only, matching
      // how an already-uploaded series' dicomMeta behaves (readSeriesMeta's
      // own comment) — so the tree preview shows exactly what upload would.
      series = { meta, studyDate, files: [], totalBytes: 0 };
      study.series.set(meta.seriesInstanceUid, series);
      study.seriesOrder.push(meta.seriesInstanceUid);
    }
    series.files.push({
      path: file.path,
      size: file.size,
      instanceNumber: fileMeta?.instanceNumber ?? null,
      fileArrivalIndex: arrivalIndex,
    });
    series.totalBytes += file.size;
    if (series.studyDate == null && studyDate != null) {
      series.studyDate = studyDate;
    }
  });

  const plannedStudies = studyOrder.map((studyInstanceUid) =>
    buildStudy(studies.get(studyInstanceUid)!, today),
  );

  const totals = plannedStudies.reduce<ImportPlanTotals>(
    (sum, study) => ({
      studies: sum.studies + 1,
      series: sum.series + study.seriesCount,
      files: sum.files + study.fileCount,
      bytes: sum.bytes + study.totalBytes,
    }),
    { studies: 0, series: 0, files: 0, bytes: 0 },
  );

  return { studies: plannedStudies, skipped, totals };
}

function buildStudy(study: StudyAccumulator, today: string): PlannedStudy {
  const series = study.seriesOrder.map((uid) => buildSeries(study.series.get(uid)!, today));

  const modalities: string[] = [];
  const seenModalities = new Set<string>();
  const descriptionCounts = new Map<string, number>();
  let documentDate = series[0]?.documentDate ?? today;
  let fileCount = 0;
  let totalBytes = 0;

  for (const item of series) {
    if (!seenModalities.has(item.meta.modality)) {
      seenModalities.add(item.meta.modality);
      modalities.push(item.meta.modality);
    }
    if (item.meta.studyDescription) {
      descriptionCounts.set(
        item.meta.studyDescription,
        (descriptionCounts.get(item.meta.studyDescription) ?? 0) + 1,
      );
    }
    if (item.documentDate < documentDate) {
      documentDate = item.documentDate;
    }
    fileCount += item.fileCount;
    totalBytes += item.totalBytes;
  }

  const studyDescription = mostCommonStudyDescription(descriptionCounts);

  return {
    studyInstanceUid: study.studyInstanceUid,
    label: studyLabel({ modalities, studyDescription }),
    studyDescription,
    modalities,
    documentDate,
    series,
    seriesCount: series.length,
    fileCount,
    totalBytes,
  };
}

function buildSeries(series: SeriesAccumulator, today: string): PlannedSeries {
  const files = [...series.files]
    .sort((a, b) => {
      if (a.instanceNumber != null && b.instanceNumber != null && a.instanceNumber !== b.instanceNumber) {
        return a.instanceNumber - b.instanceNumber;
      }
      if (a.instanceNumber != null && b.instanceNumber == null) {
        return -1;
      }
      if (a.instanceNumber == null && b.instanceNumber != null) {
        return 1;
      }
      return a.fileArrivalIndex - b.fileArrivalIndex;
    })
    .map(({ path, size, instanceNumber }) => ({ path, size, instanceNumber }));

  const viewability = viewabilityFromMeta(series.meta, "application/dicom");

  return {
    seriesInstanceUid: series.meta.seriesInstanceUid,
    label: seriesLabel(series.meta),
    documentType: IMPORT_DOCUMENT_TYPE,
    documentDate: series.studyDate ?? today,
    meta: series.meta,
    group: seriesGroup(series.meta),
    viewability,
    files,
    fileCount: files.length,
    totalBytes: series.totalBytes,
    selectedByDefault: viewability.kind === "images" || viewability.kind === "report",
  };
}

/**
 * Same "most frequent non-blank studyDescription" rule as
 * shared/studies.ts's summarize() uses once records are uploaded — kept as
 * its own tiny copy here so the pre-upload tree preview reads identically
 * without pulling MedicalDocument-shaped records through this module.
 */
function mostCommonStudyDescription(counts: Map<string, number>): string {
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
