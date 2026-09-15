import { describe, expect, it } from "vitest";
import {
  IMPORT_HEAD_BYTES,
  planImport,
  type ImportSourceFile,
} from "./import-plan";
import {
  buildMiniCtDicom,
  buildMiniSr,
  SOP_BASIC_TEXT_SR,
} from "./mini-ct-dicom";

const STUDY_A = "1.2.826.0.1.3680043.8.498.study.a";
const STUDY_B = "1.2.826.0.1.3680043.8.498.study.b";
const SERIES_VOLUME = "1.2.826.0.1.3680043.8.498.series.volume";
const SERIES_SR = "1.2.826.0.1.3680043.8.498.series.sr";
const SERIES_US = "1.2.826.0.1.3680043.8.498.series.us";

function sourceFile(path: string, bytes: Buffer): ImportSourceFile {
  const uint8 = new Uint8Array(bytes);
  return {
    path,
    size: uint8.length,
    // Fixtures here are all well under IMPORT_HEAD_BYTES, but slice like the
    // real client does — a head read is all planImport ever sees.
    head: uint8.slice(0, IMPORT_HEAD_BYTES),
  };
}

/** Two studies, three series (one SR), one non-DICOM file, deliberately out of upload order. */
function referenceFixtureSet(): ImportSourceFile[] {
  const volumeSlice2 = sourceFile(
    "disc/ST000001/SE000007/CT000002",
    buildMiniCtDicom({
      studyInstanceUid: STUDY_A,
      seriesInstanceUid: SERIES_VOLUME,
      modality: "CT",
      studyDescription: "Coronary CTA",
      seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      sliceThickness: 0.6,
      instanceNumber: 2,
      studyDate: "20260214",
    }),
  );
  const volumeSlice1 = sourceFile(
    "disc/ST000001/SE000007/CT000001",
    buildMiniCtDicom({
      studyInstanceUid: STUDY_A,
      seriesInstanceUid: SERIES_VOLUME,
      modality: "CT",
      studyDescription: "Coronary CTA",
      seriesDescription: "DS_CorCTA 0.6 Bv40 3 BestDiast 77 %",
      sliceThickness: 0.6,
      instanceNumber: 1,
      studyDate: "20260214",
    }),
  );
  const srFile = sourceFile(
    "disc/ST000001/SE001975/SR000001",
    buildMiniSr({
      title: "Radiology Report",
      nodes: [],
      sopClass: SOP_BASIC_TEXT_SR,
      studyInstanceUid: STUDY_A,
      seriesInstanceUid: SERIES_SR,
    }),
  );
  const usFile = sourceFile(
    "disc/ST000002/SE000000/US000001",
    buildMiniCtDicom({
      studyInstanceUid: STUDY_B,
      seriesInstanceUid: SERIES_US,
      modality: "US",
      studyDescription: "Echocardiogram",
      instanceNumber: 1,
      studyDate: "20260210",
    }),
  );
  const index = sourceFile("disc/DICOMDIR", Buffer.from("not a dicom file"));

  // Deliberately not in study/series/slice order — planImport must not rely
  // on arrival order to group or to sort a series' own slices.
  return [srFile, volumeSlice2, index, usFile, volumeSlice1];
}

describe("planImport", () => {
  it("groups files into studies and series, dropping the non-DICOM file", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });

    expect(plan.studies).toHaveLength(2);
    expect(plan.skipped).toEqual([
      { path: "disc/DICOMDIR", reason: expect.any(String) },
    ]);
  });

  it("orders a series' files by instanceNumber, not arrival order", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    const studyA = plan.studies.find((s) => s.studyInstanceUid === STUDY_A)!;
    const volume = studyA.series.find((s) => s.seriesInstanceUid === SERIES_VOLUME)!;

    expect(volume.files.map((f) => f.path)).toEqual([
      "disc/ST000001/SE000007/CT000001",
      "disc/ST000001/SE000007/CT000002",
    ]);
  });

  it("labels a volume series and defaults it selected (viewable)", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    const studyA = plan.studies.find((s) => s.studyInstanceUid === STUDY_A)!;
    const volume = studyA.series.find((s) => s.seriesInstanceUid === SERIES_VOLUME)!;

    expect(volume.label).toBe("CT volume, 0.6 mm, best diastole");
    expect(volume.group).toBe("volume");
    expect(volume.viewability).toEqual({ kind: "images" });
    expect(volume.selectedByDefault).toBe(true);
    expect(volume.fileCount).toBe(2);
    expect(volume.documentType).toBe("x_ray");
  });

  it("defaults an empty Basic Text SR unselected, with its empty-report viewability", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    const studyA = plan.studies.find((s) => s.studyInstanceUid === STUDY_A)!;
    const report = studyA.series.find((s) => s.seriesInstanceUid === SERIES_SR)!;

    expect(report.viewability).toEqual({
      kind: "empty-report",
      reason: expect.any(String),
    });
    expect(report.selectedByDefault).toBe(false);
    expect(report.fileCount).toBe(1);
  });

  it("reads a series' documentDate from StudyDate, never touching dicomMeta", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    const studyA = plan.studies.find((s) => s.studyInstanceUid === STUDY_A)!;
    const volume = studyA.series.find((s) => s.seriesInstanceUid === SERIES_VOLUME)!;

    expect(volume.documentDate).toBe("2026-02-14");
    expect(Object.keys(volume.meta)).not.toContain("studyDate");
  });

  it("falls back to today for a series with no StudyDate tag", () => {
    const files = [
      sourceFile(
        "disc/ST000003/SE000001/OT000001",
        buildMiniCtDicom({
          studyInstanceUid: "study-no-date",
          seriesInstanceUid: "series-no-date",
          modality: "OT",
        }),
      ),
    ];
    const plan = planImport(files, { today: "2026-09-14" });
    expect(plan.studies[0].series[0].documentDate).toBe("2026-09-14");
  });

  it("takes a study's label and documentDate from plan 10's rules and the earliest series date", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    const studyA = plan.studies.find((s) => s.studyInstanceUid === STUDY_A)!;
    const studyB = plan.studies.find((s) => s.studyInstanceUid === STUDY_B)!;

    expect(studyA.label).toBe("Coronary CT angiography");
    expect(studyA.documentDate).toBe("2026-02-14");
    expect(studyB.label).toBe("Echocardiogram");
    expect(studyB.documentDate).toBe("2026-02-10");
  });

  it("totals studies, series, files and bytes across the whole plan", () => {
    const plan = planImport(referenceFixtureSet(), { today: "2026-09-14" });
    expect(plan.totals.studies).toBe(2);
    expect(plan.totals.series).toBe(3);
    expect(plan.totals.files).toBe(4);
    expect(plan.totals.bytes).toBeGreaterThan(0);
  });

  it("returns an empty plan for no files", () => {
    const plan = planImport([], { today: "2026-09-14" });
    expect(plan.studies).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.totals).toEqual({ studies: 0, series: 0, files: 0, bytes: 0 });
  });

  it("skips a DICOM file whose header can't be read", () => {
    const bytes = new Uint8Array(200);
    bytes.set([0x44, 0x49, 0x43, 0x4d], 128); // DICM preamble, garbage after
    const plan = planImport(
      [{ path: "disc/broken", size: 200, head: bytes }],
      { today: "2026-09-14" },
    );
    expect(plan.studies).toEqual([]);
    expect(plan.skipped).toEqual([
      { path: "disc/broken", reason: expect.any(String) },
    ]);
  });
});
