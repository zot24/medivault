import { ChevronRight, ImageIcon } from "lucide-react";
import { useSrReport } from "@/lib/use-sr-report";
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
import { flattenMeasurements, formatMeasurement, srViewability, type SrNode } from "@shared/dicom-sr";
import type { MedicalDocument } from "@shared/schema";
import { EMPTY_REPORT_REASON, OPAQUE_VENDOR_SESSION_REASON } from "@shared/viewability";

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
  const documentId = focus?.id ?? null;
  const { report, error, siblingIndex } = useSrReport(documentId, open, siblingDocuments);

  const measurements = report ? flattenMeasurements(report.nodes) : [];
  // The row that opens this dialog already hides itself for an
  // empty-report/opaque record (plan 11, part B); this is the fallback for
  // a deep link or a stale list that still opens one — same sentence, this
  // time from the actual parse rather than the cheap per-record guess.
  const contentKind = report ? srViewability(report) : null;
  const hasContent = contentKind === "report";
  const nothingToDisplayReason =
    contentKind === "empty-report"
      ? EMPTY_REPORT_REASON
      : contentKind === "opaque"
        ? OPAQUE_VENDOR_SESSION_REASON
        : null;
  const nothingToDisplayMessage = nothingToDisplayReason
    ? `Nothing to display — ${nothingToDisplayReason}`
    : "This report has no readable content.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="sr-report-view">
        <DialogHeader>
          <DialogTitle>{report?.title || focus?.title || "Structured report"}</DialogTitle>
          <DialogDescription>
            {hasContent
              ? "Findings read from this report's content tree."
              : nothingToDisplayMessage}
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
            {nothingToDisplayMessage}
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
                          {measurement.label ? (
                            <>
                              <div className="text-foreground">{measurement.label}</div>
                              <div className="text-xs text-foreground-subtle">
                                {measurement.path.join(" › ") || "—"}
                              </div>
                            </>
                          ) : (
                            measurement.path.join(" › ") || "—"
                          )}
                        </TableCell>
                        <TableCell>{measurement.name}</TableCell>
                        <TableCell className="text-right">
                          {formatMeasurement(measurement.value, measurement.unit)}
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
