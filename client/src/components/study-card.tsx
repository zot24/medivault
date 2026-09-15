import { Link } from "wouter";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Layers, ScanLine } from "lucide-react";
import type { StudySummary } from "@/lib/sdk";
import { useThumbnail } from "@/lib/thumbnails";
import { thumbnailPosition } from "@/lib/study-thumbnail";
import { studyLabel, studySeries, studyFileCountLabel } from "@shared/studies";
import { localDate } from "@shared/upload-kinds";
import { useMultiFrameSummary } from "@/lib/multi-frame-summary";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface StudyCardProps {
  study: StudySummary;
}

export default function StudyCard({ study }: StudyCardProps) {
  const thumbnailSource =
    study.primary ?? study.groups.images[0] ?? study.groups.snapshot[0] ?? null;
  const thumbnail = useThumbnail(
    thumbnailSource?.id ?? -1,
    thumbnailSource ? thumbnailPosition(thumbnailSource) : 0,
    thumbnailSource?.dicomMeta ?? null,
  );
  // Plan 12: same wording as a series row — "3 runs · 298 frames" instead
  // of "3 images" when the study is (or contains) an angiography record.
  // The file *count* always comes from study.fileCount (every series in
  // the study), never from the XA-only subset useMultiFrameSummary sums —
  // see studyFileCountLabel.
  const multiFrame = useMultiFrameSummary(studySeries(study));
  const fileCountLabel = studyFileCountLabel(study, multiFrame);

  return (
    <Card
      className="card-vault group transition-all duration-300 hover:-translate-y-1"
      data-testid={`study-card-${study.studyInstanceUid}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3 flex-1 min-w-0">
            <div className="w-16 h-16 rounded-xl bg-black/80 flex items-center justify-center overflow-hidden flex-shrink-0">
              {thumbnail ? (
                <img
                  src={thumbnail}
                  alt=""
                  className="w-full h-full object-contain"
                  data-testid={`study-thumbnail-${study.studyInstanceUid}`}
                />
              ) : (
                <ScanLine className="h-6 w-6 text-white/60" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg leading-tight mb-1 font-display truncate">
                {studyLabel(study) || "Imaging study"}
              </h3>
              {study.studyDescription && (
                <p
                  className="text-sm text-foreground-muted font-body truncate mb-2"
                  data-testid={`study-description-${study.studyInstanceUid}`}
                >
                  {study.studyDescription}
                </p>
              )}
              <div className="flex items-center flex-wrap gap-2">
                {study.modalities.map((modality) => (
                  <span key={modality} className="badge-sage">
                    <span className="font-body">{modality}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-4 text-sm text-foreground-muted font-body">
          {study.documentDate && (
            <div>{format(localDate(study.documentDate), "MMM d, yyyy")}</div>
          )}
          <div className="flex items-center">
            <Layers className="mr-2 h-4 w-4 text-primary" />
            <span data-testid={`study-summary-${study.studyInstanceUid}`}>
              {study.seriesCount === 1 ? "1 series" : `${study.seriesCount} series`}
              {" · "}
              {fileCountLabel}
              {" · "}
              {formatBytes(study.totalBytes)}
            </span>
          </div>
        </div>

        <Link href={`/studies/${encodeURIComponent(study.studyInstanceUid)}`}>
          <Button
            variant="outline"
            size="sm"
            className="w-full border-border text-foreground hover:bg-surface-1 hover:border-primary/30 group/btn"
            data-testid={`button-open-study-${study.studyInstanceUid}`}
          >
            <span className="font-body">Open study</span>
            <ChevronRight className="ml-auto h-4 w-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
