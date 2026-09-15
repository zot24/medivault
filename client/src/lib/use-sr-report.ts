import { useEffect, useState } from "react";
import { documentFileUrl } from "@/lib/owned-file";
import { parseSr, type SrNode } from "@shared/dicom-sr";
import type { MedicalDocument } from "@shared/schema";

export type ParsedSrReport = { title: string; nodes: SrNode[] };

/** Maps a file's SOP instance UID to the sibling record that holds it. */
async function buildSiblingIndex(
  siblings: MedicalDocument[],
): Promise<Map<string, MedicalDocument>> {
  const index = new Map<string, MedicalDocument>();
  await Promise.all(
    siblings
      .filter((sibling) => sibling.dicomMeta)
      .map(async (sibling) => {
        try {
          const response = await fetch(`/api/documents/${sibling.id}/files`, {
            credentials: "include",
          });
          if (!response.ok) {
            return;
          }
          const files = (await response.json()) as { sopInstanceUid?: string | null }[];
          for (const file of files) {
            if (file.sopInstanceUid) {
              index.set(file.sopInstanceUid, sibling);
            }
          }
        } catch {
          // Best-effort: the report still renders with plain UIDs.
        }
      }),
  );
  return index;
}

/**
 * Fetches and parses one document's structured report content, plus an
 * index resolving IMAGE content items to the sibling record that holds
 * that SOP instance UID (used by both the report dialog and the report
 * page — plan 14 — so the fetch/parse/sibling-index logic lives in one
 * place). Resets to the loading state whenever `documentId` changes, or
 * whenever `enabled` goes false then true again.
 */
export function useSrReport(
  documentId: number | null,
  enabled: boolean,
  siblingDocuments?: MedicalDocument[],
): {
  report: ParsedSrReport | null;
  error: string | null;
  siblingIndex: Map<string, MedicalDocument>;
} {
  const [report, setReport] = useState<ParsedSrReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siblingIndex, setSiblingIndex] = useState<Map<string, MedicalDocument>>(new Map());

  useEffect(() => {
    setReport(null);
    setError(null);
    setSiblingIndex(new Map());
    if (!enabled || documentId == null) {
      return;
    }

    let cancelled = false;
    (async () => {
      const response = await fetch(documentFileUrl(documentId, 0), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Could not load this report.");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const parsed = parseSr(bytes);
      if (cancelled) {
        return;
      }
      if (!parsed) {
        throw new Error("This file isn't a readable structured report.");
      }
      setReport(parsed);

      if (siblingDocuments && siblingDocuments.length > 0) {
        const index = await buildSiblingIndex(siblingDocuments);
        if (!cancelled) {
          setSiblingIndex(index);
        }
      }
    })().catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : "Could not load this report.");
      }
    });

    return () => {
      cancelled = true;
    };
    // siblingDocuments is derived fresh from the study each render; only the
    // document identity and enabled flag should restart the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, documentId]);

  return { report, error, siblingIndex };
}
