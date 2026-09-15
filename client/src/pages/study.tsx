import { useState } from "react";
import { Link, type RouteComponentProps } from "wouter";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { useStudies } from "@/lib/sdk";
import type { StudySummary } from "@/lib/sdk";
import type { MedicalDocument } from "@shared/schema";
import Navigation from "@/components/navigation";
import DicomSeriesViewer from "@/components/dicom-series-viewer";
import SrReportView from "@/components/sr-report-view";
import TypeBadge from "@/components/type-badge";
import { useThumbnail } from "@/lib/thumbnails";
import { thumbnailPosition } from "@/lib/study-thumbnail";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { seriesLabel } from "@shared/dicom-meta";
import { groupReports, recordFileCountLabel, studyCounts, studyLabel, studySeries } from "@shared/studies";
import { localDate } from "@shared/upload-kinds";
import { useMultiFrameSummary } from "@/lib/multi-frame-summary";
import { ArrowLeft, Eye, FileText, ScanLine } from "lucide-react";

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
}: {
  series: MedicalDocument;
  onView: (series: MedicalDocument) => void;
}) {
  const label = series.dicomMeta ? seriesLabel(series.dicomMeta) : series.title;
  // Plan 12: an angiography record's fileCount is its cine runs, not
  // stills — "3 runs · 298 frames" reads truer than "3 images".
  const multiFrame = useMultiFrameSummary([series]);
  const countLabel = multiFrame
    ? recordFileCountLabel(multiFrame.fileCount, multiFrame.totalFrames)
    : recordFileCountLabel(series.fileCount, null);
  return (
    <div
      className="flex items-center gap-4 p-3 rounded-xl border border-border hover:border-primary/30 hover:bg-surface-1 transition-colors"
      data-testid={`series-row-${series.id}`}
    >
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
        <p className="text-sm text-foreground-muted font-body">{countLabel}</p>
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
  layout = "list",
}: {
  title: string;
  series: MedicalDocument[];
  onView: (series: MedicalDocument) => void;
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
            <SeriesRow key={item.id} series={item} onView={onView} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportsSection({
  records,
  onView,
}: {
  records: MedicalDocument[];
  onView: (series: MedicalDocument) => void;
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onView(row.representative)}
                  className="border-border text-foreground hover:bg-surface-1 flex-shrink-0"
                  data-testid={`button-view-report-${row.representative.id}`}
                >
                  <Eye className="mr-2 h-4 w-4" />
                  <span className="font-body">View</span>
                </Button>
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

export default function Study({
  params,
}: RouteComponentProps<{ studyInstanceUid: string }>) {
  const { isAuthenticated, isLoading } = useAuth();
  const { data: studies, isLoading: studiesLoading } = useStudies({
    enabled: isAuthenticated,
  });
  const [viewerDocument, setViewerDocument] = useState<MedicalDocument | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);

  const study = studies?.find(
    (candidate) => candidate.studyInstanceUid === params.studyInstanceUid,
  );

  const openViewer = (series: MedicalDocument) => {
    setViewerDocument(series);
    setViewerOpen(true);
  };

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
            {counts.fileCount === 1 ? "1 image" : `${counts.fileCount} images`}
          </p>
        </div>

        <Section title="Images" series={orderedImages(study)} onView={openViewer} />
        <Section
          title="Measurements"
          series={study.groups.snapshot}
          onView={openViewer}
          layout="grid"
        />
        <Section title="Analysis" series={study.groups.analysis} onView={openViewer} />
        <ReportsSection records={study.groups.report} onView={openViewer} />
        <Section
          title="Other"
          series={[...study.groups.localizer, ...study.groups.other]}
          onView={openViewer}
        />

        {study.seriesCount === 0 && (
          <Card className="card-sanctuary">
            <CardContent className="p-8 text-center text-foreground-muted font-body">
              <FileText className="h-8 w-8 mx-auto mb-3 text-foreground-subtle" />
              No series in this study yet.
            </CardContent>
          </Card>
        )}
      </div>

      {viewerDocument?.dicomMeta?.modality === "SR" ? (
        <SrReportView
          document={viewerDocument}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          siblingDocuments={studySeries(study)}
          onOpenSibling={openViewer}
        />
      ) : (
        <DicomSeriesViewer
          document={viewerDocument}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
        />
      )}
    </div>
  );
}
