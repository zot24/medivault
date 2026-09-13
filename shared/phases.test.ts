import { describe, expect, it } from "vitest";
import { detectPhases, type PhaseSourceFile } from "./phases";

function file(overrides: Partial<PhaseSourceFile> & Pick<PhaseSourceFile, "position">): PhaseSourceFile {
  return {
    instanceNumber: null,
    sliceLocation: null,
    phase: null,
    ...overrides,
  };
}

describe("detectPhases", () => {
  it("returns null for an empty file list", () => {
    expect(detectPhases([])).toBeNull();
  });

  it("splits 10 phases of 3 slices from repeating slice locations, upload order phase-major", () => {
    const locations = [30, 20, 10]; // upload order within a phase; head (30) first
    const files: PhaseSourceFile[] = [];
    let position = 0;
    for (let phase = 0; phase < 10; phase += 1) {
      for (const location of locations) {
        files.push(
          file({
            position: position++,
            instanceNumber: position,
            sliceLocation: location,
          }),
        );
      }
    }

    const result = detectPhases(files);
    expect(result?.phases).toHaveLength(10);
    expect(result?.phases.map((p) => p.label)).toEqual([
      "Phase 1",
      "Phase 2",
      "Phase 3",
      "Phase 4",
      "Phase 5",
      "Phase 6",
      "Phase 7",
      "Phase 8",
      "Phase 9",
      "Phase 10",
    ]);
    result?.phases.forEach((phase, index) => {
      expect(phase.positions).toEqual([index * 3, index * 3 + 1, index * 3 + 2]);
    });
  });

  it("reorders a phase's slices head-first by descending slice location", () => {
    // Upload order is ascending (10, 20, 30); expected head-first is descending.
    const files: PhaseSourceFile[] = [
      file({ position: 0, instanceNumber: 1, sliceLocation: 10 }),
      file({ position: 1, instanceNumber: 2, sliceLocation: 20 }),
      file({ position: 2, instanceNumber: 3, sliceLocation: 30 }),
      file({ position: 3, instanceNumber: 4, sliceLocation: 10 }),
      file({ position: 4, instanceNumber: 5, sliceLocation: 20 }),
      file({ position: 5, instanceNumber: 6, sliceLocation: 30 }),
    ];

    const result = detectPhases(files);
    expect(result?.phases).toHaveLength(2);
    expect(result?.phases[0].positions).toEqual([2, 1, 0]);
    expect(result?.phases[1].positions).toEqual([5, 4, 3]);
  });

  it("falls back to instanceNumber when slice locations tie within a phase", () => {
    // 2 distinct locations (10, 20) over 4 files -> 2 phases of 2; within
    // each phase both slices happen to share a location, so the tie-break
    // (ascending instanceNumber) decides the order.
    const files: PhaseSourceFile[] = [
      file({ position: 0, instanceNumber: 2, sliceLocation: 10 }),
      file({ position: 1, instanceNumber: 1, sliceLocation: 10 }),
      file({ position: 2, instanceNumber: 4, sliceLocation: 20 }),
      file({ position: 3, instanceNumber: 3, sliceLocation: 20 }),
    ];

    const result = detectPhases(files);
    expect(result?.phases).toHaveLength(2);
    // Within each phase, ties on sliceLocation break by ascending instanceNumber.
    expect(result?.phases[0].positions).toEqual([1, 0]);
    expect(result?.phases[1].positions).toEqual([3, 2]);
  });

  it("returns null for a plain volume of all-distinct slice locations", () => {
    const files: PhaseSourceFile[] = Array.from({ length: 5 }, (_, index) =>
      file({ position: index, instanceNumber: index + 1, sliceLocation: index * 10 }),
    );
    expect(detectPhases(files)).toBeNull();
  });

  it("returns null when slice locations don't divide the file count evenly", () => {
    // 3 distinct locations, 7 files: 7 % 3 !== 0.
    const files: PhaseSourceFile[] = [
      file({ position: 0, sliceLocation: 10 }),
      file({ position: 1, sliceLocation: 20 }),
      file({ position: 2, sliceLocation: 30 }),
      file({ position: 3, sliceLocation: 10 }),
      file({ position: 4, sliceLocation: 20 }),
      file({ position: 5, sliceLocation: 30 }),
      file({ position: 6, sliceLocation: 10 }),
    ];
    expect(detectPhases(files)).toBeNull();
  });

  it("returns null when slice location is missing on any file", () => {
    const files: PhaseSourceFile[] = [
      file({ position: 0, sliceLocation: 10 }),
      file({ position: 1, sliceLocation: null }),
    ];
    expect(detectPhases(files)).toBeNull();
  });

  it("groups by explicit phase tag even when only one file carries it", () => {
    // Distinct phase values with >= 2 entries elsewhere is still required;
    // a single tagged file among untagged ones does not form 2 groups.
    const files: PhaseSourceFile[] = [
      file({ position: 0, sliceLocation: 10, phase: 10 }),
      file({ position: 1, sliceLocation: 20 }),
    ];
    expect(detectPhases(files)).toBeNull();
  });

  it("prefers explicit phase tags over slice-location repetition, labeling by percentage", () => {
    // Slice locations alone would also imply 2 phases of 2, but the explicit
    // phase tag must win and label using "%" since values are <= 100.
    const files: PhaseSourceFile[] = [
      file({ position: 0, sliceLocation: 10, phase: 70, instanceNumber: 1 }),
      file({ position: 1, sliceLocation: 20, phase: 70, instanceNumber: 2 }),
      file({ position: 2, sliceLocation: 10, phase: 30, instanceNumber: 3 }),
      file({ position: 3, sliceLocation: 20, phase: 30, instanceNumber: 4 }),
    ];

    const result = detectPhases(files);
    expect(result?.phases.map((p) => p.label)).toEqual(["30 %", "70 %"]);
    expect(result?.phases.map((p) => p.key)).toEqual(["30", "70"]);
    // Head-first within a phase: descending slice location.
    expect(result?.phases.find((p) => p.key === "70")?.positions).toEqual([1, 0]);
  });

  it("labels an explicit phase tag in milliseconds when values exceed 100", () => {
    const files: PhaseSourceFile[] = [
      file({ position: 0, phase: 620 }),
      file({ position: 1, phase: 140 }),
    ];

    const result = detectPhases(files);
    expect(result?.phases.map((p) => p.label)).toEqual(["140 ms", "620 ms"]);
  });

  it("falls back to slice location instead of dropping files whose phase tag is missing", () => {
    // A real-world oddity: most instances carry the phase tag, a handful
    // don't. Distinct slice locations here (10, 20, 30) mean the
    // slice-location fallback also can't form phases, so every file must
    // end up on a plain, ungrouped volume rather than 2 of the 3 positions
    // silently vanishing from every phase.
    const files: PhaseSourceFile[] = [
      file({ position: 0, phase: 70, sliceLocation: 10 }),
      file({ position: 1, phase: 30, sliceLocation: 20 }),
      file({ position: 2, phase: null, sliceLocation: 30 }),
    ];

    const result = detectPhases(files);
    expect(result).toBeNull();
  });

  it("never drops a file's position from every phase when phase tags are partial", () => {
    // Same partial-tag scenario, but with slice locations that repeat
    // cleanly (10, 20, 10) so the fallback CAN form phases: every input
    // position -- including the untagged one -- must still surface exactly
    // once across the returned phases.
    const files: PhaseSourceFile[] = [
      file({ position: 0, phase: 70, sliceLocation: 20 }),
      file({ position: 1, phase: 30, sliceLocation: 10 }),
      file({ position: 2, phase: null, sliceLocation: 20 }),
      file({ position: 3, phase: null, sliceLocation: 10 }),
    ];

    const result = detectPhases(files);
    const allPositions = (result?.phases ?? []).flatMap((p) => p.positions);
    expect(new Set(allPositions)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("returns null (a plain volume) when every file shares one identical, non-null slice location", () => {
    // Anonymization tooling zeroing spatial tags, a burned-in
    // secondary-capture series, or repeated single-position acquisitions:
    // locationCount === 1 must not be split into N one-slice "phases".
    const files: PhaseSourceFile[] = Array.from({ length: 5 }, (_, index) =>
      file({ position: index, sliceLocation: 0 }),
    );

    const result = detectPhases(files);
    expect(result).toBeNull();
  });
});
