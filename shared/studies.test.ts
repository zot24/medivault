import { describe, expect, it } from "vitest";
import type { DicomSeriesMeta } from "./dicom-meta";
import type { MedicalDocument } from "./schema";
import { groupIntoStudies, primarySeries } from "./studies";

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

    const [study] = groupIntoStudies([volume, snapshot, report]);
    expect(study.groups.volume).toEqual([volume]);
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
