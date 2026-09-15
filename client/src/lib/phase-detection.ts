import { useQuery } from "@tanstack/react-query";
import { detectPhases, type PhaseSourceFile } from "@shared/phases";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import type { StudyPhaseInfo } from "@shared/studies";

/**
 * Only a multi-file CT/MR record can have anything for `detectPhases`
 * (shared/phases.ts) to find — every other modality, or a single-file
 * record, always resolves to "no phases" without a fetch. Callers use this
 * to decide whether `usePhaseDetection`/`usePhaseDetectionMap` below are
 * worth calling at all, same as `isMultiFrameRecord` gates
 * `useMultiFrameSummary` for XA.
 */
export function isPhaseCandidate(
  meta: Pick<DicomSeriesMeta, "modality">,
  fileCount: number,
): boolean {
  return (meta.modality === "CT" || meta.modality === "MR") && fileCount > 1;
}

const NO_PHASES: StudyPhaseInfo = { hasPhases: false, sliceCount: 0 };

/**
 * One-off form for a caller outside render (upload-dialog.tsx's toast,
 * built once in a mutation's `onSuccess` rather than a component body) —
 * `usePhaseDetection`/`usePhaseDetectionMap` below are the hook forms of
 * the same fetch-and-detect, for callers that render.
 */
export async function detectPhasesFor(documentId: number): Promise<StudyPhaseInfo> {
  return detectPhasesOf(documentId);
}

async function detectPhasesOf(documentId: number): Promise<StudyPhaseInfo> {
  const response = await fetch(`/api/documents/${documentId}/files`, {
    credentials: "include",
  });
  if (!response.ok) {
    return NO_PHASES;
  }
  const files = (await response.json()) as PhaseSourceFile[];
  const detection = detectPhases(files);
  if (!detection) {
    return NO_PHASES;
  }
  // detectPhases only ever returns an even split (shared/phases.ts requires
  // files.length % locationCount === 0), so this is always a whole number.
  return { hasPhases: true, sliceCount: files.length / detection.phases.length };
}

/**
 * Whether `documentId` (a CT/MR record with more than one file — see
 * `isPhaseCandidate`) is actually multi-phase, and how many slices make up
 * one phase — what `shared/series-kind.ts`'s `hasPhases` and
 * `shared/upload-kinds.ts` `countLabel`'s `frames` need to word a record's
 * count as "10 phases × 580 slices" instead of the plain "5800 slices" it
 * reads as without this (plan 13). One GET .../files, only while `enabled`;
 * null until it answers, so callers keep their plain wording until then.
 */
export function usePhaseDetection(documentId: number, enabled: boolean): StudyPhaseInfo | null {
  const { data } = useQuery({
    queryKey: ["phase-detection", documentId],
    queryFn: () => detectPhasesOf(documentId),
    enabled,
  });
  return data ?? null;
}

/**
 * Batched form of `usePhaseDetection` for a list of candidates (Dashboard's
 * recent items, one per study's primary series) — one GET .../files per
 * candidate, all under one query, so a page with several matches only
 * re-renders once every answer is back, same batching
 * `useMultiFrameSummary` does for XA's totalFrames.
 */
export function usePhaseDetectionMap(
  candidates: { id: number }[],
): Map<number, StudyPhaseInfo> | null {
  const ids = candidates.map((candidate) => candidate.id);
  const { data } = useQuery({
    queryKey: ["phase-detection-map", ids],
    queryFn: async () => {
      const entries = await Promise.all(
        candidates.map(
          async (candidate) => [candidate.id, await detectPhasesOf(candidate.id)] as const,
        ),
      );
      return new Map(entries);
    },
    enabled: ids.length > 0,
  });
  return data ?? null;
}
