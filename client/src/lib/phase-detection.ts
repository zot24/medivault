import { useQuery } from "@tanstack/react-query";
import { detectPhases, type PhaseSourceFile } from "@shared/phases";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import type { StudyPhaseInfo } from "@shared/studies";

export { isPhaseCandidate } from "@shared/phases";

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
 * Whether one record is multi-phase — for the study page's volume rows,
 * where the files of the open study are the only ones ever fetched. Lists
 * of many studies use the server's StudySummary.primaryPhases instead.
 */
export function usePhaseDetection(documentId: number, enabled: boolean): StudyPhaseInfo | null {
  const { data } = useQuery({
    queryKey: ["phase-detection", documentId],
    queryFn: () => detectPhasesOf(documentId),
    enabled,
  });
  return data ?? null;
}
