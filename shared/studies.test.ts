import { describe, expect, it } from "vitest";
import type { DicomSeriesMeta } from "./dicom-meta";
import type { MedicalDocument } from "./schema";
import {
  documentIdsForItems,
  documentItemDate,
  documentItemKey,
  documentStats,
  filterStudies,
  groupIntoStudies,
  groupReports,
  listDocumentItems,
  primarySeries,
  splitDocuments,
  studyCounts,
  studyLabel,
} from "./studies";

const BASIC_TEXT_SR = "1.2.840.10008.5.1.4.1.1.88.11";
const COMPREHENSIVE_SR = "1.2.840.10008.5.1.4.1.1.88.33";

let nextId = 1;

function record(
  overrides: Partial<MedicalDocument> & {
    dicomMeta?: Partial<DicomSeriesMeta> | null;
  } = {},
): MedicalDocument {
  const { dicomMeta, ...rest } = overrides;
  return {
    id: nextId++,
    userId: "user-1",
    title: "Series",
    description: null,
    documentType: "x_ray",
    fileName: "series.dcm",
    filePath: "user-1/series.dcm",
    fileSize: "1000",
    mimeType: "application/dicom",
    documentDate: "2026-01-01",
    doctorName: null,
    facilityName: null,
    tags: [],
    fileCount: 1,
    dicomMeta:
      dicomMeta === null
        ? null
        : {
            studyInstanceUid: "study-1",
            seriesInstanceUid: `series-${nextId}`,
            sopClassUid: "1.2.840.10008.5.1.4.1.1.2",
            modality: "CT",
            studyDescription: "Coronary CT angiography",
            seriesDescription: "",
            seriesNumber: null,
            rows: 512,
            columns: 512,
            numberOfFrames: 1,
            photometric: "MONOCHROME2",
            transferSyntaxUid: "1.2.840.10008.1.2.4.70",
            sliceThickness: null,
            imageType: [],
            hasOverlay: false,
            ...dicomMeta,
          },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...rest,
  };
}

describe("groupIntoStudies", () => {
  it("drops records without dicomMeta", () => {
    const pdf = record({ dicomMeta: null, mimeType: "application/pdf" });
    expect(groupIntoStudies([pdf])).toEqual([]);
  });

  it("groups records by studyInstanceUid", () => {
    const a = record({
      documentDate: "2026-02-02",
      fileCount: 78,
      fileSize: "1000000",
      dicomMeta: { studyInstanceUid: "study-a", modality: "CT" },
    });
    const b = record({
      documentDate: "2026-02-01",
      fileCount: 774,
      fileSize: "500000000",
      dicomMeta: {
        studyInstanceUid: "study-a",
        modality: "CT",
        sliceThickness: 0.6,
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      },
    });
    const other = record({
      dicomMeta: { studyInstanceUid: "study-b", modality: "US" },
    });

    const studies = groupIntoStudies([a, b, other]);

    expect(studies).toHaveLength(2);
    const studyA = studies.find((s) => s.studyInstanceUid === "study-a")!;
    expect(studyA.seriesCount).toBe(2);
    expect(studyA.fileCount).toBe(78 + 774);
    expect(studyA.totalBytes).toBe(1000000 + 500000000);
    // Earliest of the two dates.
    expect(studyA.documentDate).toBe("2026-02-01");
    expect(studyA.modalities).toEqual(["CT"]);
    expect(studyA.primary).toBe(b);
  });

  it("picks the most common non-empty study description", () => {
    const a = record({
      dicomMeta: { studyInstanceUid: "s", studyDescription: "CorCTA" },
    });
    const b = record({
      dicomMeta: { studyInstanceUid: "s", studyDescription: "CorCTA" },
    });
    const c = record({
      dicomMeta: { studyInstanceUid: "s", studyDescription: "" },
    });

    const [study] = groupIntoStudies([a, b, c]);
    expect(study.studyDescription).toBe("CorCTA");
  });

  it("sorts records into their series group", () => {
    const volume = record({
      dicomMeta: { studyInstanceUid: "s", modality: "CT", sliceThickness: 3 },
    });
    const snapshot = record({
      dicomMeta: {
        studyInstanceUid: "s",
        modality: "CT",
        imageType: ["DERIVED", "SECONDARY"],
        photometric: "MONOCHROME2",
        numberOfFrames: 1,
      },
    });
    const report = record({ dicomMeta: { studyInstanceUid: "s", modality: "SR" } });
    const echo = record({ dicomMeta: { studyInstanceUid: "s", modality: "US" } });

    const [study] = groupIntoStudies([volume, snapshot, report, echo]);
    expect(study.groups.volume).toEqual([volume]);
    expect(study.groups.images).toEqual([echo]);
    expect(study.groups.snapshot).toEqual([snapshot]);
    expect(study.groups.report).toEqual([report]);
    expect(study.groups.analysis).toEqual([]);
    expect(study.groups.localizer).toEqual([]);
    expect(study.groups.other).toEqual([]);
  });
});

describe("primarySeries", () => {
  it("returns null when there are no volume records", () => {
    const snapshot = record({
      dicomMeta: {
        modality: "CT",
        imageType: ["DERIVED", "SECONDARY"],
        photometric: "MONOCHROME2",
        numberOfFrames: 1,
      },
    });
    expect(primarySeries([snapshot])).toBeNull();
  });

  it("prefers the best-diastole volume with the most files", () => {
    const diastoleSmall = record({
      fileCount: 78,
      dicomMeta: {
        modality: "CT",
        sliceThickness: 3,
        seriesDescription: "DS_CorCTA 3.0 Bv36 3 BestDiast 77 %",
      },
    });
    const diastoleBig = record({
      fileCount: 774,
      dicomMeta: {
        modality: "CT",
        sliceThickness: 0.6,
        seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      },
    });
    const systole = record({
      fileCount: 5800,
      dicomMeta: {
        modality: "CT",
        sliceThickness: 0.75,
        seriesDescription: "DS_CorCTA 0.75 Bv40 3 BestSyst 27 %",
      },
    });

    expect(primarySeries([diastoleSmall, diastoleBig, systole])).toBe(diastoleBig);
  });

  it("falls back to the volume with the most files when none is best-diastole", () => {
    const small = record({
      fileCount: 78,
      dicomMeta: { modality: "CT", sliceThickness: 3 },
    });
    const big = record({
      fileCount: 5800,
      dicomMeta: {
        modality: "CT",
        sliceThickness: 0.75,
        seriesDescription: "DS_CorCTA 0.75 Bv40 3 10 - 100 %",
      },
    });

    expect(primarySeries([small, big])).toBe(big);
  });
});

describe("groupReports", () => {
  it("labels a Basic Text SR record as a written report", () => {
    const report = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: BASIC_TEXT_SR,
        seriesDescription: "Radiology Report",
        seriesNumber: 1975,
      },
    });

    const [row] = groupReports([report]);

    expect(row.label).toBe("Written report");
    expect(row.count).toBe(1);
    expect(row.representative).toBe(report);
  });

  it("collapses written reports sharing seriesDescription and seriesNumber into one row with a count", () => {
    const reports = [1, 2, 3].map(() =>
      record({
        dicomMeta: {
          modality: "SR",
          sopClassUid: BASIC_TEXT_SR,
          seriesDescription: "Radiology Report",
          seriesNumber: 1975,
        },
      }),
    );

    const rows = groupReports(reports);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Written report", count: 3 });
    expect(rows[0].representative).toBe(reports[0]);
  });

  it("keeps two distinct blank-keyed reports as separate rows instead of collapsing them", () => {
    // Both records have a blank seriesDescription and a null seriesNumber —
    // that's "nothing to distinguish them", not "the same report", so they
    // must not collapse into a single row.
    const first = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: BASIC_TEXT_SR,
        seriesDescription: "",
        seriesNumber: null,
      },
    });
    const second = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: BASIC_TEXT_SR,
        seriesDescription: "",
        seriesNumber: null,
      },
    });

    const rows = groupReports([first, second]);

    expect(rows).toHaveLength(2);
    expect(rows[0].representative).toBe(first);
    expect(rows[1].representative).toBe(second);
  });

  it("keeps other SR reports separate and labelled via seriesLabel when they don't share description and number", () => {
    const calciumScore = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: "1.2.840.10008.5.1.4.1.1.88.22",
        seriesDescription: "CT Calcium Scoring",
        seriesNumber: 1025,
      },
    });
    const cardiacFunction = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: "1.2.840.10008.5.1.4.1.1.88.22",
        seriesDescription: "Cardiac Function",
        seriesNumber: 1034,
      },
    });

    const rows = groupReports([calciumScore, cardiacFunction]);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ label: "Report — CT Calcium Scoring", count: 1 });
    expect(rows[1]).toMatchObject({ label: "Report — Cardiac Function", count: 1 });
  });

  it('labels a Comprehensive SR "Evidence Documents" record as unreadable analysis data, keeping the rest of the description', () => {
    const record1 = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Cardiac Function — Evidence Documents",
        seriesNumber: 1178,
      },
    });

    const [row] = groupReports([record1]);

    expect(row.label).toBe("Analysis data — Cardiac Function");
  });

  it('falls back to bare "Analysis data" when nothing but the phrase remains', () => {
    const record1 = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Evidence Documents",
        seriesNumber: 1178,
      },
    });

    const [row] = groupReports([record1]);

    expect(row.label).toBe("Analysis data");
  });

  it("does not relabel a Comprehensive SR whose description doesn't mention Evidence Documents", () => {
    const record1 = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "CT Coronary",
        seriesNumber: 1043,
      },
    });

    const [row] = groupReports([record1]);

    expect(row.label).toBe("Report — CT Coronary");
  });

  it("orders unreadable Evidence Documents rows after the readable report rows", () => {
    const unreadable = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Evidence Documents",
        seriesNumber: 1178,
      },
    });
    const readable = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "CT Coronary",
        seriesNumber: 1043,
      },
    });

    // Unreadable row passed first, in `records` order — it must still sort last.
    const rows = groupReports([unreadable, readable]);

    expect(rows.map((row) => row.label)).toEqual([
      "Report — CT Coronary",
      "Analysis data",
    ]);
  });

  it("orders readable reports before empty reports before opaque analysis rows", () => {
    // Passed out of order on purpose: the sort must still land readable,
    // then empty, then opaque, regardless of input order.
    const opaque = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Evidence Documents",
        seriesNumber: 1178,
      },
    });
    const empty = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: BASIC_TEXT_SR,
        seriesDescription: "Radiology Report",
        seriesNumber: 1975,
      },
    });
    const readable = record({
      dicomMeta: {
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "CT Coronary",
        seriesNumber: 1043,
      },
    });

    const rows = groupReports([opaque, empty, readable]);

    expect(rows.map((row) => row.label)).toEqual([
      "Report — CT Coronary",
      "Written report",
      "Analysis data",
    ]);
  });
});

describe("studyCounts", () => {
  it("counts every series as viewable when none are reports", () => {
    const a = record({ dicomMeta: { studyInstanceUid: "s", modality: "CT", sliceThickness: 3 } });
    const b = record({ dicomMeta: { studyInstanceUid: "s", modality: "US" } });
    const [study] = groupIntoStudies([a, b]);

    expect(studyCounts(study)).toEqual({ seriesCount: 2, viewableCount: 2, fileCount: 2 });
  });

  it("excludes empty and opaque reports from the viewable count", () => {
    const volume = record({
      fileCount: 774,
      dicomMeta: { studyInstanceUid: "s", modality: "CT", sliceThickness: 0.6 },
    });
    const readableReport = record({
      dicomMeta: {
        studyInstanceUid: "s",
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "CT Coronary",
      },
    });
    const emptyReport = record({
      dicomMeta: {
        studyInstanceUid: "s",
        modality: "SR",
        sopClassUid: BASIC_TEXT_SR,
        seriesDescription: "Radiology Report",
      },
    });
    const opaqueReport = record({
      dicomMeta: {
        studyInstanceUid: "s",
        modality: "SR",
        sopClassUid: COMPREHENSIVE_SR,
        seriesDescription: "Evidence Documents",
      },
    });
    const [study] = groupIntoStudies([volume, readableReport, emptyReport, opaqueReport]);

    expect(studyCounts(study)).toEqual({
      seriesCount: 4,
      viewableCount: 2,
      fileCount: 774 + 1 + 1 + 1,
    });
  });
});

describe("documentStats", () => {
  it("counts an ordinary document and a study as one item each", () => {
    const doc = record({ dicomMeta: null });
    const [study] = groupIntoStudies([record({ dicomMeta: { studyInstanceUid: "s" } })]);

    const stats = documentStats([doc], [study], { searchQuery: "", documentType: "all" });

    expect(stats.total).toBe(2);
  });

  it("counts a study as filtered when the search matches one of its series", () => {
    const [study] = groupIntoStudies([
      record({
        dicomMeta: {
          studyInstanceUid: "s",
          seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
        },
      }),
    ]);

    const matching = documentStats([], [study], {
      searchQuery: "corcta",
      documentType: "all",
    });
    const nonMatching = documentStats([], [study], {
      searchQuery: "nope",
      documentType: "all",
    });

    expect(matching.filtered).toBe(1);
    expect(nonMatching.filtered).toBe(0);
  });

  it("excludes studies once a specific document-type filter is applied", () => {
    const [study] = groupIntoStudies([record({ dicomMeta: { studyInstanceUid: "s" } })]);

    const stats = documentStats([], [study], { searchQuery: "", documentType: "lab_result" });

    expect(stats.filtered).toBe(0);
  });

  it("matches an ordinary document by title, description, doctor, or facility", () => {
    const doc = record({
      dicomMeta: null,
      title: "Blood panel",
      description: null,
      doctorName: "Dr. Rivera",
      facilityName: null,
    });

    expect(
      documentStats([doc], [], { searchQuery: "rivera", documentType: "all" }).filtered,
    ).toBe(1);
    expect(
      documentStats([doc], [], { searchQuery: "nope", documentType: "all" }).filtered,
    ).toBe(0);
  });

  it("counts items whose date falls in the current local month", () => {
    const now = new Date();
    const thisMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    const lastYearIso = `${now.getFullYear() - 1}-01-15`;
    const doc = record({ dicomMeta: null, createdAt: now });
    const [thisMonthStudy] = groupIntoStudies([
      record({ documentDate: thisMonthIso, dicomMeta: { studyInstanceUid: "a" } }),
    ]);
    const [oldStudy] = groupIntoStudies([
      record({ documentDate: lastYearIso, dicomMeta: { studyInstanceUid: "b" } }),
    ]);

    const stats = documentStats([doc], [thisMonthStudy, oldStudy], {
      searchQuery: "",
      documentType: "all",
    });

    expect(stats.thisMonth).toBe(2);
  });

  it("reads a study's date-only documentDate as a local calendar date, not UTC midnight", () => {
    // Regression for the "day early" bug: a date-only string parsed with
    // `new Date(str)` reads as UTC midnight, which can land in the wrong
    // local month at a month boundary west of UTC.
    const now = new Date();
    const firstOfMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const [study] = groupIntoStudies([
      record({ documentDate: firstOfMonthIso, dicomMeta: { studyInstanceUid: "s" } }),
    ]);

    const stats = documentStats([], [study], { searchQuery: "", documentType: "all" });

    expect(stats.thisMonth).toBe(1);
  });
});

describe("filterStudies", () => {
  it("keeps a study when the search matches one of its series, and drops it otherwise", () => {
    const [study] = groupIntoStudies([
      record({
        dicomMeta: {
          studyInstanceUid: "s",
          seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
        },
      }),
    ]);

    expect(filterStudies([study], { searchQuery: "corcta", documentType: "all" })).toEqual([
      study,
    ]);
    expect(filterStudies([study], { searchQuery: "nope", documentType: "all" })).toEqual([]);
  });

  it("drops every study once a specific document-type filter is applied", () => {
    const [study] = groupIntoStudies([record({ dicomMeta: { studyInstanceUid: "s" } })]);

    expect(filterStudies([study], { searchQuery: "", documentType: "lab_result" })).toEqual([]);
  });

  it("agrees with documentStats().filtered on the same input — the grid and the tile must never disagree", () => {
    const [matching] = groupIntoStudies([
      record({
        dicomMeta: { studyInstanceUid: "match", seriesDescription: "Cardiac CT" },
      }),
    ]);
    const [nonMatching] = groupIntoStudies([
      record({
        dicomMeta: { studyInstanceUid: "no-match", seriesDescription: "Renal ultrasound" },
      }),
    ]);
    const filter = { searchQuery: "cardiac", documentType: "all" };

    const shown = filterStudies([matching, nonMatching], filter);
    const stats = documentStats([], [matching, nonMatching], filter);

    expect(shown).toEqual([matching]);
    expect(stats.filtered).toBe(shown.length);
  });
});

describe("splitDocuments", () => {
  it("sends records with dicomMeta to studies and the rest to ordinary", () => {
    const pdf = record({ dicomMeta: null, title: "Blood panel" });
    const series = record({ dicomMeta: { studyInstanceUid: "s" } });

    const { ordinary, studies } = splitDocuments([pdf, series]);

    expect(ordinary).toEqual([pdf]);
    expect(studies).toHaveLength(1);
    expect(studies[0].studyInstanceUid).toBe("s");
  });

  it("never returns a record with dicomMeta under ordinary", () => {
    const records = [
      record({ dicomMeta: null }),
      record({ dicomMeta: { studyInstanceUid: "a" } }),
      record({ dicomMeta: { studyInstanceUid: "b" } }),
      record({ dicomMeta: null }),
    ];

    const { ordinary } = splitDocuments(records);

    expect(ordinary).toHaveLength(2);
    expect(ordinary.every((doc) => doc.dicomMeta === null)).toBe(true);
  });

  it("collapses the three series of one study into a single study", () => {
    const series = [1, 2, 3].map(() => record({ dicomMeta: { studyInstanceUid: "s" } }));

    const { ordinary, studies } = splitDocuments(series);

    expect(ordinary).toEqual([]);
    expect(studies).toHaveLength(1);
    expect(studies[0].seriesCount).toBe(3);
  });
});

describe("listDocumentItems", () => {
  it("returns one item per study and one per ordinary document", () => {
    const pdf = record({ dicomMeta: null });
    const series = [1, 2, 3].map(() => record({ dicomMeta: { studyInstanceUid: "s" } }));

    const items = listDocumentItems([pdf, ...series]);

    expect(items).toHaveLength(2);
    expect(items.filter((item) => item.kind === "study")).toHaveLength(1);
    expect(items.filter((item) => item.kind === "document")).toHaveLength(1);
  });

  it("counts a 32-series study as one item", () => {
    const series = Array.from({ length: 32 }, () =>
      record({ dicomMeta: { studyInstanceUid: "big" } }),
    );

    expect(listDocumentItems(series)).toHaveLength(1);
  });

  it("sorts items by date descending, dating a study by its earliest series", () => {
    const older = record({ dicomMeta: null, documentDate: "2026-01-05" });
    const newer = record({ dicomMeta: null, documentDate: "2026-03-05" });
    const studySeries = [
      record({ documentDate: "2026-02-20", dicomMeta: { studyInstanceUid: "s" } }),
      record({ documentDate: "2026-02-01", dicomMeta: { studyInstanceUid: "s" } }),
    ];

    const items = listDocumentItems([older, ...studySeries, newer]);

    expect(items.map(documentItemDate)).toEqual([
      "2026-03-05",
      "2026-02-01",
      "2026-01-05",
    ]);
  });

  it("gives every item a stable key so a list never falls back to indexes", () => {
    const pdf = record({ dicomMeta: null });
    const series = record({ dicomMeta: { studyInstanceUid: "s" } });

    const keys = listDocumentItems([pdf, series]).map(documentItemKey);

    expect(new Set(keys).size).toBe(2);
    expect(keys).toContain("study-s");
    expect(keys).toContain(`document-${pdf.id}`);
  });
});

describe("studyLabel", () => {
  function studyOf(modality: string, studyDescription: string) {
    const [study] = groupIntoStudies([
      record({ dicomMeta: { studyInstanceUid: "s", modality, studyDescription } }),
    ]);
    return study;
  }

  const cases: Array<[string, string, string]> = [
    ["CT", "CorCTA cardiaco", "Coronary CT angiography"],
    ["CT", "Coronarias", "Coronary CT angiography"],
    ["CT", "Torax", "CT scan"],
    ["CT", "", "CT scan"],
    ["US", "Ecocardiograma", "Echocardiogram"],
    ["US", "Echo stress", "Echocardiogram"],
    ["US", "Cardio doppler", "Echocardiogram"],
    ["US", "Abdomen", "Ultrasound"],
    ["XA", "Cateterismo", "Cardiac catheterization"],
    ["XA", "Coronariografia", "Cardiac catheterization"],
    ["XA", "Miembro inferior", "Angiography"],
  ];

  it.each(cases)(
    "labels a %s study described as '%s' as '%s'",
    (modality, description, expected) => {
      expect(studyLabel(studyOf(modality, description))).toBe(expected);
    },
  );

  it("falls back to the raw study description for a modality with no human label", () => {
    expect(studyLabel(studyOf("MR", "Cardiac MRI"))).toBe("Cardiac MRI");
  });

  it("falls back to the modality when there is no description either", () => {
    expect(studyLabel(studyOf("MR", ""))).toBe("MR");
  });

  it("labels a mixed CT + SR study by its imaging modality, not the report one", () => {
    const [study] = groupIntoStudies([
      record({
        dicomMeta: { studyInstanceUid: "s", modality: "SR", studyDescription: "CorCTA" },
      }),
      record({
        dicomMeta: { studyInstanceUid: "s", modality: "CT", studyDescription: "CorCTA" },
      }),
    ]);

    expect(studyLabel(study)).toBe("Coronary CT angiography");
  });
});

describe("documentIdsForItems", () => {
  it("expands a study into every one of its series ids", () => {
    const series = [1, 2, 3].map(() => record({ dicomMeta: { studyInstanceUid: "s" } }));
    const items = listDocumentItems(series);

    expect(documentIdsForItems(items).sort()).toEqual(series.map((s) => s.id).sort());
  });

  it("keeps an ordinary document as its own id", () => {
    const pdf = record({ dicomMeta: null });

    expect(documentIdsForItems(listDocumentItems([pdf]))).toEqual([pdf.id]);
  });

  it("returns no ids for no items", () => {
    expect(documentIdsForItems([])).toEqual([]);
  });

  it("never repeats an id when the same item is listed twice", () => {
    const series = [1, 2].map(() => record({ dicomMeta: { studyInstanceUid: "s" } }));
    const items = listDocumentItems(series);

    expect(documentIdsForItems([...items, ...items])).toEqual(series.map((s) => s.id));
  });
});
