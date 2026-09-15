import { useQuery } from "@tanstack/react-query";
import { detectPhases, type PhaseSourceFile } from "@shared/phases";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import type { StudyPhaseInfo } from "@shared/studies";
import { OWNED, filesListUrl, sourceKey, type FileSource } from "@/lib/file-source";
import { useFileSource } from "@/lib/file-source-context";

export { isPhaseCandidate } from "@shared/phases";

const NO_PHASES: StudyPhaseInfo = { hasPhases: false, sliceCount: 0 };

/**
 * One-off form for a caller outside render (upload-dialog.tsx's toast,
 * built once in a mutation's `onSuccess` rather than a component body) —
 * `usePhaseDetection`/`usePhaseDetectionMap` below are the hook forms of
 * the same fetch-and-detect, for callers that render.
 */
export async function detectPhasesFor(documentId: number): Promise<StudyPhaseInfo> {
  return detectPhasesOf(OWNED, documentId);
}

async function detectPhasesOf(source: FileSource, documentId: number): Promise<StudyPhaseInfo> {
  const response = await fetch(filesListUrl(source, documentId), {
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
  const source = useFileSource();
  const { data } = useQuery({
    queryKey: ["phase-detection", sourceKey(source), documentId],
    queryFn: () => detectPhasesOf(source, documentId),
    enabled,
  });
  return data ?? null;
}
