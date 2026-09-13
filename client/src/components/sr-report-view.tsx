import { useEffect, useState } from "react";
import { ChevronRight, ImageIcon } from "lucide-react";
import { documentFileUrl } from "@/lib/owned-file";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { flattenMeasurements, parseSr, type SrNode } from "@shared/dicom-sr";
import type { MedicalDocument } from "@shared/schema";

type SrReportViewProps = {
  document: MedicalDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Every series in the same study (this record included). Used to resolve
   * an IMAGE content item's SOP instance UID to the sibling record that
   * holds it, so it can be shown as a link instead of a bare UID.
   */
  siblingDocuments?: MedicalDocument[];
  onOpenSibling?: (document: MedicalDocument) => void;
};

type ParsedReport = { title: string; nodes: SrNode[] };

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

function NodeTree({ node }: { node: SrNode }) {
  return (
    <li>
      <span className="text-foreground-subtle">{node.type}</span>
      {node.name && <span className="ml-1 font-medium text-foreground">{node.name}</span>}
      {node.text != null && (
        <span className="ml-1 text-foreground-muted">
          {node.text ? `— ${node.text}` : "(empty)"}
        </span>
      )}
      {node.value != null && (
        <span className="ml-1 text-foreground-muted">
          — {node.value} {node.unit}
        </span>
      )}
      {node.code != null && <span className="ml-1 text-foreground-muted">— {node.code}</span>}
      {node.imageRef != null && (
        <span className="ml-1 text-foreground-subtle font-mono text-xs">
          — SOP {node.imageRef}
        </span>
      )}
      {node.children.length > 0 && (
        <ul className="ml-4 mt-1 space-y-1 border-l border-border pl-3">
          {node.children.map((child, index) => (
            <NodeTree key={index} node={child} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function SrReportView({
  document: focus,
  open,
  onOpenChange,
  siblingDocuments,
  onOpenSibling,
}: SrReportViewProps) {
  const [report, setReport] = useState<ParsedReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [siblingIndex, setSiblingIndex] = useState<Map<string, MedicalDocument>>(new Map());
  const documentId = focus?.id ?? null;

  useEffect(() => {
    setReport(null);
    setError(null);
    setSiblingIndex(new Map());
    if (!open || documentId == null) {
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
    // document identity and dialog visibility should restart the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  const measurements = report ? flattenMeasurements(report.nodes) : [];
  const hasContent = (report?.nodes.length ?? 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="sr-report-view">
        <DialogHeader>
          <DialogTitle>{report?.title || focus?.title || "Structured report"}</DialogTitle>
          <DialogDescription>
            {hasContent
              ? "Findings read from this report's content tree."
              : "This report has no readable content."}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-destructive" data-testid="sr-report-error">
            {error}
          </p>
        ) : !report ? (
          <p className="text-sm text-foreground-muted" data-testid="sr-report-loading">
            Loading report…
          </p>
        ) : !hasContent ? (
          <p className="text-sm text-foreground-muted" data-testid="sr-report-empty">
            This report has no readable content.
          </p>
        ) : (
          <div className="space-y-4">
            {measurements.length > 0 && (
              <Table data-testid="sr-measurements-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead>Measurement</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {measurements.map((measurement, index) => {
                    const sibling = measurement.imageRef
                      ? siblingIndex.get(measurement.imageRef)
                      : undefined;
                    return (
                      <TableRow key={index} data-testid={`sr-measurement-${index}`}>
                        <TableCell className="text-foreground-muted">
                          {measurement.path.join(" › ") || "—"}
                        </TableCell>
                        <TableCell>{measurement.name}</TableCell>
                        <TableCell className="text-right">
                          {measurement.value} {measurement.unit}
                        </TableCell>
                        <TableCell>
                          {sibling && onOpenSibling && (
                            <button
                              type="button"
                              className="text-foreground-subtle hover:text-primary"
                              title="Open evidence image"
                              data-testid={`sr-measurement-image-${index}`}
                              onClick={() => onOpenSibling(sibling)}
                            >
                              <ImageIcon className="h-4 w-4" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}

            <Collapsible>
              <CollapsibleTrigger
                className="group flex items-center text-sm text-foreground-muted hover:text-foreground"
                data-testid="sr-raw-tree-trigger"
              >
                <ChevronRight className="mr-1 h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                Raw content tree
              </CollapsibleTrigger>
              <CollapsibleContent data-testid="sr-raw-tree">
                <ul className="mt-2 space-y-1 text-sm">
                  {report.nodes.map((node, index) => (
                    <NodeTree key={index} node={node} />
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
