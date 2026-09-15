import { useState } from "react";
import { Link, type RouteComponentProps } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useStudies } from "@/lib/sdk";
import type { StudySummary } from "@/lib/sdk";
import type { MedicalDocument } from "@shared/schema";
import Navigation from "@/components/navigation";
import DicomSeriesViewer from "@/components/dicom-series-viewer";
import TypeBadge from "@/components/type-badge";
import { useThumbnail } from "@/lib/thumbnails";
import { thumbnailPosition } from "@/lib/study-thumbnail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { seriesLabel } from "@shared/dicom-meta";
import { groupReports, studyCounts, studyKindCountLabel, studyLabel, studySeries } from "@shared/studies";
import { runLabel, seriesKind, viewLabel } from "@shared/series-kind";
import { countLabel, localDate } from "@shared/upload-kinds";
import { useMultiFrameSummary } from "@/lib/multi-frame-summary";
import { isPhaseCandidate, usePhaseDetection } from "@/lib/phase-detection";
import { useSeriesFiles, type SeriesFileRow } from "@/lib/series-files";
import { ArrowLeft, Eye, FileText, ScanLine } from "lucide-react";

/** A record with more views/runs than this shows the rest as a "+N more" chip instead of another thumbnail (plan 13 section D). */
const VIEW_STRIP_PREVIEW_LIMIT = 8;

function seriesFileLabel(
  kind: "views" | "runs",
  file: SeriesFileRow,
  runNumber: number,
): string {
  if (kind === "views") {
    return viewLabel({
      imageType: file.imageType ?? [],
      usRegionDataTypes: file.usRegionDataTypes ?? [],
      numberOfFrames: file.numberOfFrames ?? 1,
      frameRate: file.frameRate,
    });
  }
  return runLabel(
    {
      positionerPrimaryAngle: file.positionerPrimaryAngle,
      positionerSecondaryAngle: file.positionerSecondaryAngle,
      numberOfFrames: file.frameIndex?.numberOfFrames ?? file.numberOfFrames ?? 1,
    },
    runNumber,
  );
}

/** One thumbnail of the inline view/run strip (plan 13 section D). */
function ViewStripThumbnail({
  documentId,
  position,
  dicomMeta,
  label,
  onClick,
  testId,
}: {
  documentId: number;
  position: number;
  dicomMeta: MedicalDocument["dicomMeta"];
  label: string;
  onClick: () => void;
  testId: string;
}) {
  const dataUrl = useThumbnail(documentId, position, dicomMeta);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 w-20 text-left group"
      data-testid={testId}
    >
      <div className="w-20 h-20 rounded-lg bg-black/80 flex items-center justify-center overflow-hidden">
        {dataUrl ? (
          <img src={dataUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <ScanLine className="h-4 w-4 text-white/50" />
        )}
      </div>
      <p
        className="mt-1 text-[11px] text-foreground-subtle font-body truncate group-hover:text-foreground"
        title={label}
      >
        {label}
      </p>
    </button>
  );
}

/**
 * The study page row's inline view/run strip (plan 13 section D): the first
 * VIEW_STRIP_PREVIEW_LIMIT thumbnails of a multi-file echo/angiography
 * record, so a person can open the right view directly instead of always
 * landing on the first one. `onOpenAt` opens the viewer already scrubbed to
 * that file.
 */
function SeriesViewStrip({
  series,
  kind,
  onOpenAt,
}: {
  series: MedicalDocument;
  kind: "views" | "runs";
  onOpenAt: (series: MedicalDocument, position: number) => void;
}) {
  const { data: files } = useSeriesFiles(series.id, true);
  if (!files || files.length === 0) {
    return null;
  }
  const shown = files.slice(0, VIEW_STRIP_PREVIEW_LIMIT);
  const hiddenCount = files.length - shown.length;
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 mt-2"
      data-testid={`series-view-strip-${series.id}`}
    >
      {shown.map((file, index) => (
        <ViewStripThumbnail
          key={file.position}
          documentId={series.id}
          position={file.position}
          dicomMeta={series.dicomMeta}
          label={seriesFileLabel(kind, file, index + 1)}
          onClick={() => onOpenAt(series, file.position)}
          testId={`series-view-strip-thumb-${series.id}-${index}`}
        />
      ))}
      {hiddenCount > 0 && (
        <div className="flex-shrink-0 w-20 flex items-center justify-center text-xs text-foreground-subtle font-body">
          +{hiddenCount} more
        </div>
      )}
    </div>
  );
}

function Thumbnail({
  document: series,
  className,
}: {
  document: MedicalDocument;
  className: string;
}) {
  const dataUrl = useThumbnail(series.id, thumbnailPosition(series), series.dicomMeta);
  return (
    <div
      className={`rounded-lg bg-black/80 flex items-center justify-center overflow-hidden flex-shrink-0 ${className}`}
    >
      {dataUrl ? (
        <img src={dataUrl} alt="" className="w-full h-full object-contain" />
      ) : (
        <ScanLine className="h-5 w-5 text-white/50" />
      )}
    </div>
  );
}

function SeriesRow({
  series,
  onView,
  onOpenAt,
}: {
  series: MedicalDocument;
  onView: (series: MedicalDocument) => void;
  onOpenAt: (series: MedicalDocument, position: number) => void;
}) {
  const label = series.dicomMeta ? seriesLabel(series.dicomMeta) : series.title;
  // Plan 13: word the count for what this record's files actually are — a
  // CT volume's "774 slices" (or "10 phases × 580 slices" once detectPhases
  // finds a cardiac cycle in it — phase below), an echo record's "56
  // views", an angiography record's "3 runs · 298 frames" (plan 12's
  // totalFrames, from useMultiFrameSummary) — instead of the
  // modality-blind "N images".
  const multiFrame = useMultiFrameSummary([series]);
  const phaseCandidate = series.dicomMeta
    ? isPhaseCandidate(series.dicomMeta, series.fileCount)
    : false;
  const phase = usePhaseDetection(series.id, phaseCandidate);
  const kind = series.dicomMeta
    ? seriesKind(series.dicomMeta, series.fileCount, phase?.hasPhases ?? false)
    : "single";
  const fileCountLabel = countLabel(
    kind,
    series.fileCount,
    kind === "phases" ? phase?.sliceCount ?? null : multiFrame?.totalFrames ?? null,
  );
  // Plan 13 section D: a multi-file echo/angiography record shows its view/
  // run strip right in the row, so a person can open the right one directly
  // instead of always landing on the first.
  const showViewStrip = kind === "views" || kind === "runs";
  return (
    <div
      className="p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-surface-1 transition-colors"
      data-testid={`series-row-${series.id}`}
    >
      <div className="flex items-center gap-4">
        <Thumbnail document={series} className="w-16 h-16" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <TypeBadge document={series} testId={`series-modality-${series.id}`} />
          </div>
          <p className="font-medium text-foreground font-body truncate">{label}</p>
          {series.dicomMeta?.seriesDescription && (
            <p className="text-xs text-foreground-subtle font-body truncate">
              {series.dicomMeta.seriesDescription}
            </p>
          )}
          <p className="text-sm text-foreground-muted font-body">{fileCountLabel}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onView(series)}
          className="border-border text-foreground hover:bg-surface-1 flex-shrink-0"
          data-testid={`button-view-series-${series.id}`}
        >
          <Eye className="mr-2 h-4 w-4" />
          <span className="font-body">View</span>
        </Button>
      </div>
      {showViewStrip && <SeriesViewStrip series={series} kind={kind} onOpenAt={onOpenAt} />}
    </div>
  );
}

function SnapshotGrid({
  series,
  onView,
}: {
  series: MedicalDocument[];
  onView: (series: MedicalDocument) => void;
}) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
      {series.map((item) => {
        const label = item.dicomMeta ? seriesLabel(item.dicomMeta) : item.title;
        return (
          <button
            key={item.id}
            onClick={() => onView(item)}
            className="text-left group"
            data-testid={`snapshot-${item.id}`}
          >
            <Thumbnail document={item} className="w-full aspect-square" />
            <p className="mt-1 text-xs text-foreground-muted font-body truncate group-hover:text-foreground">
              {label}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function Section({
  title,
  series,
  onView,
  onOpenAt,
  layout = "list",
}: {
  title: string;
  series: MedicalDocument[];
  onView: (series: MedicalDocument) => void;
  onOpenAt: (series: MedicalDocument, position: number) => void;
  layout?: "list" | "grid";
}) {
  if (series.length === 0) {
    return null;
  }
  return (
    <div className="mb-8" data-testid={`study-section-${title.toLowerCase()}`}>
      <h2 className="text-lg font-semibold text-foreground mb-3 font-display">{title}</h2>
      {layout === "grid" ? (
        <SnapshotGrid series={series} onView={onView} />
      ) : (
        <div className="space-y-2">
          {series.map((item) => (
            <SeriesRow key={item.id} series={item} onView={onView} onOpenAt={onOpenAt} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsSection({
  records,
  reportHref,
}: {
  records: MedicalDocument[];
  reportHref: (documentId: number) => string;
}) {
  const rows = groupReports(records);
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="mb-8" data-testid="study-section-reports">
      <h2 className="text-lg font-semibold text-foreground mb-3 font-display">Reports</h2>
      <div className="space-y-2">
        {rows.map((row) => {
          // "reason" only exists on the empty-report/opaque variants — this
          // doubles as the type guard that lets TS narrow it below.
          const nothingToShow = "reason" in row.viewability ? row.viewability : null;
          return (
            <div
              key={row.key}
              className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-surface-1 transition-colors"
              data-testid={`report-row-${row.representative.id}`}
            >
              <Thumbnail document={row.representative} className="w-16 h-16" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <TypeBadge
                    document={row.representative}
                    testId={`report-modality-${row.representative.id}`}
                  />
                </div>
                <p className="font-medium text-foreground font-body truncate">
                  {row.count > 1 ? `${row.label} · ${row.count} files` : row.label}
                </p>
                {nothingToShow && (
                  <p
                    className="text-sm text-foreground-subtle font-body"
                    data-testid={`report-nothing-to-display-${row.representative.id}`}
                  >
                    Nothing to display — {nothingToShow.reason}
                  </p>
                )}
              </div>
              {!nothingToShow && (
                // A report opens full-page (plan 14) instead of the dialog
                // the other sections still use — its content tree can run
                // long, and a dialog can't scroll past its own viewport.
                <Link
                  href={reportHref(row.representative.id)}
                >
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-border text-foreground hover:bg-surface-1 flex-shrink-0"
                    data-testid={`button-view-report-${row.representative.id}`}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    <span className="font-body">View</span>
                  </Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// CT volumes (the primary one first, plan 02) followed by ultrasound
// records (plan 06) — both draw in the same "Images" section.
function orderedImages(study: StudySummary): MedicalDocument[] {
  const { volume, images } = study.groups;
  if (!study.primary) {
    return [...volume, ...images];
  }
  const rest = volume.filter((series) => series.id !== study.primary!.id);
  return [study.primary, ...rest, ...images];
}


/**
 * A study's sections (images, measurements, analysis, reports, other) and
 * the viewer they open — shared by the owner's study page and the share
 * portal, which differ only in where files come from (FileSourceProvider)
 * and where report links go.
 */
export function StudyContent({
  study,
  reportHref,
}: {
  study: StudySummary;
  reportHref: (documentId: number) => string;
}) {
  const [viewerDocument, setViewerDocument] = useState<MedicalDocument | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  // Which file's position the viewer opens on when a person picks a thumbnail
  // from a row's inline view/run strip instead of the plain View button.
  const [viewerInitialPosition, setViewerInitialPosition] = useState<number | undefined>(
    undefined,
  );

  const openViewer = (series: MedicalDocument) => {
    setViewerDocument(series);
    setViewerInitialPosition(undefined);
    setViewerOpen(true);
  };

  const openViewerAt = (series: MedicalDocument, position: number) => {
    setViewerDocument(series);
    setViewerInitialPosition(position);
    setViewerOpen(true);
  };

  return (
    <>
      <Section
        title="Images"
        series={orderedImages(study)}
        onView={openViewer}
        onOpenAt={openViewerAt}
      />
      <Section
        title="Measurements"
        series={study.groups.snapshot}
        onView={openViewer}
        onOpenAt={openViewerAt}
        layout="grid"
      />
      <Section
        title="Analysis"
        series={study.groups.analysis}
        onView={openViewer}
        onOpenAt={openViewerAt}
      />
      <ReportsSection records={study.groups.report} reportHref={reportHref} />
      <Section
        title="Other"
        series={[...study.groups.localizer, ...study.groups.other]}
        onView={openViewer}
        onOpenAt={openViewerAt}
      />

      {study.seriesCount === 0 && (
        <Card className="card-sanctuary">
          <CardContent className="p-8 text-center text-foreground-muted font-body">
            <FileText className="h-8 w-8 mx-auto mb-3 text-foreground-subtle" />
            No series in this study yet.
          </CardContent>
        </Card>
      )}

      <DicomSeriesViewer
        document={viewerDocument}
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        initialPosition={viewerInitialPosition}
      />
    </>
  );
}

export default function Study({
  params,
}: RouteComponentProps<{ studyInstanceUid: string }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: studies, isLoading: studiesLoading } = useStudies({
    enabled: isAuthenticated,
  });

  const study = studies?.find(
    (candidate) => candidate.studyInstanceUid === params.studyInstanceUid,
  );
  // Hook before the early returns below; empty when the study is not loaded yet.
  const headerMultiFrame = useMultiFrameSummary(study ? studySeries(study) : []);



  if (isLoading || studiesLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-5 w-96" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!study) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-5xl mx-auto px-6 lg:px-8 py-16 text-center">
          <h1 className="text-2xl font-semibold text-foreground mb-3 font-display">
            Study not found
          </h1>
          <p className="text-foreground-muted mb-6 font-body">
            This study isn't in your account, or it's still loading.
          </p>
          <Link href="/documents">
            <Button variant="outline" data-testid="button-back-to-documents">
              <ArrowLeft className="mr-2 h-4 w-4" />
              <span className="font-body">Back to documents</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const counts = studyCounts(study);

  return (
    <div className="min-h-screen bg-background" data-testid="study-page">
      <Navigation />
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
        <Link href="/documents">
          <Button
            variant="ghost"
            size="sm"
            className="mb-6 text-foreground-muted hover:text-foreground"
            data-testid="button-back-to-documents"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span className="font-body">Documents</span>
          </Button>
        </Link>

        <div className="mb-8">
          <div className="flex items-center flex-wrap gap-2 mb-3">
            {study.modalities.map((modality) => (
              <span key={modality} className="badge-sage">
                <span className="font-body">{modality}</span>
              </span>
            ))}
          </div>
          <h1 className="text-foreground mb-1 font-display" data-testid="text-study-label">
            {studyLabel(study) || "Imaging study"}
          </h1>
          {study.studyDescription && (
            <p className="text-foreground-muted font-body mb-2" data-testid="text-study-description">
              {study.studyDescription}
            </p>
          )}
          <p className="text-foreground-muted font-body" data-testid="text-study-counts">
            {study.documentDate && format(localDate(study.documentDate), "MMMM d, yyyy")}
            {" · "}
            {counts.seriesCount === 1 ? "1 series" : `${counts.seriesCount} series`}
            {" · "}
            {counts.viewableCount} viewable
            {" · "}
            {studyKindCountLabel(study, study.primaryPhases, headerMultiFrame)}
          </p>
        </div>

        <StudyContent
          study={study}
          reportHref={(documentId) =>
            `/studies/${encodeURIComponent(study.studyInstanceUid)}/reports/${documentId}`
          }
        />
      </div>
    </div>
  );
}
