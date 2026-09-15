import { useMemo, useState } from "react";
import { Link, type RouteComponentProps } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useStudies } from "@/lib/sdk";
import type { MedicalDocument } from "@shared/schema";
import type { StudySummary } from "@shared/studies";
import Navigation from "@/components/navigation";
import DicomSeriesViewer from "@/components/dicom-series-viewer";
import { useSrReport } from "@/lib/use-sr-report";
import { useThumbnail } from "@/lib/thumbnails";
import { thumbnailPosition } from "@/lib/study-thumbnail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  flattenMeasurements,
  formatMeasurement,
  outlineFromNodes,
  srViewability,
  type SrMeasurement,
  type SrNode,
  type SrOutlineRow,
} from "@shared/dicom-sr";
import { studySeries } from "@shared/studies";
import { EMPTY_REPORT_REASON, OPAQUE_VENDOR_SESSION_REASON } from "@shared/viewability";
import { ArrowLeft, ChevronRight, FileText, ScanLine } from "lucide-react";

function SnapshotThumbnail({ document: series }: { document: MedicalDocument }) {
  const dataUrl = useThumbnail(series.id, thumbnailPosition(series), series.dicomMeta);
  return (
    <div className="w-12 h-12 rounded-lg bg-black/80 flex items-center justify-center overflow-hidden flex-shrink-0">
      {dataUrl ? (
        <img src={dataUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <ScanLine className="h-4 w-4 text-white/50" />
      )}
    </div>
  );
}

function MeasurementsTable({
  measurements,
  siblingIndex,
  onOpenImage,
}: {
  measurements: SrMeasurement[];
  siblingIndex: Map<string, MedicalDocument>;
  onOpenImage: (document: MedicalDocument) => void;
}) {
  return (
    <Table data-testid="sr-measurements-table">
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead>Measurement</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="w-16">Snapshot</TableHead>
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
                {sibling && (
                  <button
                    type="button"
                    title="Open evidence image"
                    data-testid={`sr-measurement-snapshot-${index}`}
                    onClick={() => onOpenImage(sibling)}
                  >
                    <SnapshotThumbnail document={sibling} />
                  </button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function OutlineNode({
  row,
  collapsed,
  onToggle,
  sibling,
  onOpenImage,
}: {
  row: SrOutlineRow;
  collapsed: boolean;
  onToggle: () => void;
  sibling: MedicalDocument | undefined;
  onOpenImage: (document: MedicalDocument) => void;
}) {
  const { node, depth } = row;
  const hasChildren = node.children.length > 0;

  if (node.type === "CONTAINER") {
    return (
      <li style={{ marginLeft: depth * 16 }} data-testid={`report-outline-row-${row.id}`}>
        {hasChildren ? (
          <button
            type="button"
            className="flex items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
            onClick={onToggle}
            data-testid={`report-outline-toggle-${row.id}`}
          >
            <ChevronRight
              className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
            />
            {node.name || "Container"}
          </button>
        ) : (
          <span className="text-sm font-medium text-foreground-subtle">
            {node.name || "Container"}
          </span>
        )}
      </li>
    );
  }

  if (node.type === "IMAGE") {
    return (
      <li
        style={{ marginLeft: depth * 16 }}
        className="flex items-center gap-2 py-1"
        data-testid={`report-outline-row-${row.id}`}
      >
        <span className="text-xs text-foreground-subtle">{node.name || "Image"}</span>
        {sibling ? (
          <button
            type="button"
            title="Open evidence image"
            data-testid={`report-outline-image-${row.id}`}
            onClick={() => onOpenImage(sibling)}
          >
            <SnapshotThumbnail document={sibling} />
          </button>
        ) : (
          <span className="text-xs text-foreground-subtle font-mono">SOP {node.imageRef}</span>
        )}
      </li>
    );
  }

  return (
    <li
      style={{ marginLeft: depth * 16 }}
      className="text-sm text-foreground-muted py-0.5"
      data-testid={`report-outline-row-${row.id}`}
    >
      <span className="text-foreground-subtle">{node.type}</span>
      {node.name && <span className="ml-1 font-medium text-foreground">{node.name}</span>}
      {node.text != null && (
        <span className="ml-1">{node.text ? `— ${node.text}` : "(empty)"}</span>
      )}
      {node.value != null && (
        <span className="ml-1">
          — {node.value} {node.unit}
        </span>
      )}
      {node.code != null && <span className="ml-1">— {node.code}</span>}
    </li>
  );
}

/**
 * Which outline rows currently show: every row whose enclosing containers
 * are all expanded. `rows` is depth-first from `outlineFromNodes`, so a
 * collapsed container just skips every row deeper than it until the next
 * row back at its own depth or shallower.
 */
function visibleOutlineRows(
  rows: SrOutlineRow[],
  isCollapsed: (row: SrOutlineRow) => boolean,
): SrOutlineRow[] {
  const visible: SrOutlineRow[] = [];
  let hiddenBelowDepth: number | null = null;
  for (const row of rows) {
    if (hiddenBelowDepth != null) {
      if (row.depth > hiddenBelowDepth) {
        continue;
      }
      hiddenBelowDepth = null;
    }
    visible.push(row);
    if (row.node.type === "CONTAINER" && row.node.children.length > 0 && isCollapsed(row)) {
      hiddenBelowDepth = row.depth;
    }
  }
  return visible;
}

function ContentOutline({
  nodes,
  siblingIndex,
  onOpenImage,
}: {
  nodes: SrNode[];
  siblingIndex: Map<string, MedicalDocument>;
  onOpenImage: (document: MedicalDocument) => void;
}) {
  const rows = useMemo(() => outlineFromNodes(nodes), [nodes]);
  // Ids toggled away from their default (plan 14): a container defaults to
  // collapsed, so toggling it once means "expanded" here.
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const isCollapsed = (row: SrOutlineRow) =>
    toggled.has(row.id) ? !row.collapsedByDefault : row.collapsedByDefault;

  const visible = visibleOutlineRows(rows, isCollapsed);

  return (
    <ul className="space-y-1" data-testid="report-outline">
      {visible.map((row) => (
        <OutlineNode
          key={row.id}
          row={row}
          collapsed={isCollapsed(row)}
          onToggle={() =>
            setToggled((prev) => {
              const next = new Set(prev);
              if (next.has(row.id)) {
                next.delete(row.id);
              } else {
                next.add(row.id);
              }
              return next;
            })
          }
          sibling={row.node.imageRef ? siblingIndex.get(row.node.imageRef) : undefined}
          onOpenImage={onOpenImage}
        />
      ))}
    </ul>
  );
}

/**
 * A structured report rendered for a record of `study`: measurements table,
 * evidence snapshots, the full outline, and the viewer the snapshots open.
 * Used by the owner's report page and the share portal; only the back link
 * and the file source (FileSourceProvider) differ.
 */
export function ReportContent({
  study,
  record,
  backHref,
  backLabel = "Back to study",
}: {
  study: StudySummary;
  record: MedicalDocument;
  backHref: string;
  backLabel?: string;
}) {
  const [viewerDocument, setViewerDocument] = useState<MedicalDocument | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const siblingDocuments = studySeries(study);
  const { report, error, siblingIndex } = useSrReport(
    record.id,
    true,
    siblingDocuments,
  );

  const openImage = (document: MedicalDocument) => {
    setViewerDocument(document);
    setViewerOpen(true);
  };

  const measurements = report ? flattenMeasurements(report.nodes) : [];
  // A deep link can land here for a record whose report turns out to be
  // empty or opaque once actually parsed — same fallback the dialog used
  // to give (plan 11, part C).
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
    <>
        <Link href={backHref}>
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 text-foreground-muted hover:text-foreground"
            data-testid="button-back-to-study"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="font-body">{backLabel}</span>
          </Button>
        </Link>

        <h1 className="text-foreground mb-8 font-display" data-testid="text-report-title">
          {report?.title || record.title || "Structured report"}
        </h1>

        {error ? (
          <p className="text-sm text-destructive" data-testid="report-error">
            {error}
          </p>
        ) : !report ? (
          <p className="text-sm text-foreground-muted" data-testid="report-loading">
            Loading report…
          </p>
        ) : !hasContent ? (
          <Card className="card-sanctuary">
            <CardContent
              className="p-8 text-center text-foreground-muted font-body"
              data-testid="report-empty"
            >
              <FileText className="h-8 w-8 mx-auto mb-3 text-foreground-subtle" />
              {nothingToDisplayMessage}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {measurements.length > 0 && (
              <MeasurementsTable
                measurements={measurements}
                siblingIndex={siblingIndex}
                onOpenImage={openImage}
              />
            )}

            <div>
              <h2
                className="text-lg font-semibold text-foreground mb-3 font-display"
                data-testid="report-outline-heading"
              >
                Everything in this report
              </h2>
              <ContentOutline
                nodes={report.nodes}
                siblingIndex={siblingIndex}
                onOpenImage={openImage}
              />
            </div>
          </div>
        )}

      <DicomSeriesViewer document={viewerDocument} open={viewerOpen} onOpenChange={setViewerOpen} />
    </>
  );
}

export default function Report({
  params,
}: RouteComponentProps<{ studyInstanceUid: string; documentId: string }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: studies, isLoading: studiesLoading } = useStudies({
    enabled: isAuthenticated,
  });

  const study = studies?.find(
    (candidate) => candidate.studyInstanceUid === params.studyInstanceUid,
  );
  const documentId = Number(params.documentId);
  const record = study
    ? (studySeries(study).find((candidate) => candidate.id === documentId) ?? null)
    : null;

  const studyHref = `/studies/${encodeURIComponent(params.studyInstanceUid)}`;

  if (isLoading || studiesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-5 w-96" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!study || !record) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-3 font-display">
            Report not found
          </h1>
          <p className="text-foreground-muted mb-6 font-body">
            This report isn't in your account, or it's still loading.
          </p>
          <Link href={study ? studyHref : "/documents"}>
            <Button variant="outline" data-testid="button-back-to-study">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-body">{study ? "Back to study" : "Back to documents"}</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" data-testid="report-page">
      <Navigation />
      <div className="max-w-3xl mx-auto px-6 lg:px-8 py-8">
        <ReportContent study={study} record={record} backHref={studyHref} />
      </div>
    </div>
  );
}
