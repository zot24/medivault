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
  const distinctPhases = new Set(
    files.filter((file) => file.phase != null).map((file) => file.phase as number),
  );
  if (distinctPhases.size < 2) {
    return null;
  }

  const useMilliseconds = Math.max(...Array.from(distinctPhases)) > PERCENTAGE_MAX;
  const groups = new Map<number, PhaseSourceFile[]>();
  for (const file of files) {
    if (file.phase == null) {
      continue;
    }
    const group = groups.get(file.phase) ?? [];
    group.push(file);
    groups.set(file.phase, group);
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
  if (locationCount === 0 || files.length % locationCount !== 0) {
    return null;
  }

  const phaseCount = files.length / locationCount;
  if (phaseCount < 2) {
    return null;
  }

  // Files arrive in upload order, which for these series is phase-major:
  // consecutive runs of `locationCount` files are one phase.
  const byUploadOrder = [...files].sort((a, b) => a.position - b.position);
  const phases: Phase[] = [];
  for (let index = 0; index < phaseCount; index += 1) {
    const group = byUploadOrder.slice(
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
