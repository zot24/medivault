/**
 * Detects the multi-phase structure of a DICOM series (e.g. 10 cardiac
 * phases x 580 slices) from per-file position metadata alone, so the viewer
 * can offer a phase selector instead of a single 1..N slider through the
 * same anatomy several times. See docs/plans/04-multiphase-and-cache.md.
 */
export type PhaseSourceFile = {
  /** The file's position in the record (shared/schema.ts document_files.position). */
  position: number;
  instanceNumber: number | null;
  sliceLocation: number | null;
  phase: number | null;
};

export type Phase = {
  key: string;
  label: string;
  /** File positions belonging to this phase, ordered head-first within it. */
  positions: number[];
};

export type PhaseDetectionResult = {
  phases: Phase[];
};

/** A phase value above this reads as milliseconds (TriggerTime) rather than a percentage. */
const PERCENTAGE_MAX = 100;

export function detectPhases(files: PhaseSourceFile[]): PhaseDetectionResult | null {
  if (files.length === 0) {
    return null;
  }
  return detectFromPhaseTag(files) ?? detectFromSliceLocation(files);
}

function detectFromPhaseTag(files: PhaseSourceFile[]): PhaseDetectionResult | null {
  // A real series either tags every instance with its cardiac phase or none
  // at all; a handful of instances missing the tag (a known real-world DICOM
  // oddity) means the tag can't be trusted to place every file, so fall back
  // to slice-location detection rather than silently dropping the untagged
  // ones from every phase.
  if (files.some((file) => file.phase == null)) {
    return null;
  }

  const distinctPhases = new Set(files.map((file) => file.phase as number));
  if (distinctPhases.size < 2) {
    return null;
  }

  const useMilliseconds = Math.max(...Array.from(distinctPhases)) > PERCENTAGE_MAX;
  const groups = new Map<number, PhaseSourceFile[]>();
  for (const file of files) {
    const phase = file.phase as number;
    const group = groups.get(phase) ?? [];
    group.push(file);
    groups.set(phase, group);
  }

  const phases = Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([phase, group]) => ({
      key: String(phase),
      label: useMilliseconds ? `${phase} ms` : `${phase} %`,
      positions: orderWithinPhase(group),
    }));
  return { phases };
}

function detectFromSliceLocation(files: PhaseSourceFile[]): PhaseDetectionResult | null {
  const locations = files.map((file) => file.sliceLocation);
  if (locations.some((location) => location == null)) {
    return null;
  }

  const distinctLocations = new Set(locations as number[]);
  const locationCount = distinctLocations.size;
  // A single shared location (e.g. anonymized/zeroed spatial tags, or a
  // burned-in secondary-capture series) means every file trivially "repeats"
  // the same one location; that's an ordinary N-slice volume, not N
  // one-slice phases, so require at least 2 distinct locations to split.
  if (locationCount < 2 || files.length % locationCount !== 0) {
    return null;
  }

  const phaseCount = files.length / locationCount;
  if (phaseCount < 2) {
    return null;
  }

  // Phase-major means consecutive runs of `locationCount` files (by instance
  // number) are one phase -- but files don't necessarily *arrive* in that
  // order: a CD folder with un-padded names (IM1, IM2, ..., IM11) lists in
  // lexical order, which the upload dialog then reads and assigns positions
  // in. Sort by instanceNumber (falling back to arrival position when it's
  // missing) before slicing into runs, rather than trusting arrival order.
  const bySeriesOrder = [...files].sort((a, b) => {
    const aKey = a.instanceNumber ?? a.position;
    const bKey = b.instanceNumber ?? b.position;
    return aKey - bKey;
  });
  const phases: Phase[] = [];
  for (let index = 0; index < phaseCount; index += 1) {
    const group = bySeriesOrder.slice(
      index * locationCount,
      (index + 1) * locationCount,
    );
    phases.push({
      key: String(index + 1),
      label: `Phase ${index + 1}`,
      positions: orderWithinPhase(group),
    });
  }
  return { phases };
}

/** Head first: sliceLocation descending, falling back to instanceNumber ascending. */
function orderWithinPhase(group: PhaseSourceFile[]): number[] {
  return [...group]
    .sort((a, b) => {
      if (
        a.sliceLocation != null &&
        b.sliceLocation != null &&
        a.sliceLocation !== b.sliceLocation
      ) {
        return b.sliceLocation - a.sliceLocation;
      }
      return (a.instanceNumber ?? 0) - (b.instanceNumber ?? 0);
    })
    .map((file) => file.position);
}

/**
 * Only a multi-file CT/MR record can hold a cardiac cycle for `detectPhases`
 * to find; everything else is "no phases" without reading a single file.
 */
export function isPhaseCandidate(
  meta: { modality: string } | null | undefined,
  fileCount: number,
): boolean {
  return !!meta && (meta.modality === "CT" || meta.modality === "MR") && fileCount > 1;
}

/** What a list needs to word a record's count as "10 phases × 580 slices". */
export type StudyPhaseInfo = { hasPhases: boolean; sliceCount: number };

export const NO_PHASES: StudyPhaseInfo = { hasPhases: false, sliceCount: 0 };

export function phaseInfoFromFiles(files: PhaseSourceFile[]): StudyPhaseInfo {
  const detection = detectPhases(files);
  if (!detection) {
    return NO_PHASES;
  }
  // detectPhases only returns an even split, so this is a whole number.
  return { hasPhases: true, sliceCount: files.length / detection.phases.length };
}
