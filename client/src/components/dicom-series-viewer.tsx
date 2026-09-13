import { useEffect, useRef, useState } from "react";
import { documentFileUrl } from "@/lib/owned-file";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CT_WINDOW_PRESETS,
  compositeOverlays,
  describeUndrawableFrame,
  overlaysFromPart10,
  pixelFrameFromPart10,
  rgbaFromFrame,
  windowForPreset,
  type DicomFrame,
  type DicomOverlay,
} from "@shared/dicom-frame";
import {
  nextSliceToLoad,
  sliceDeltaFromKey,
  stepSliceIndex,
} from "@shared/upload-kinds";
import type { MedicalDocument } from "@shared/schema";

type DicomSeriesViewerProps = {
  document: MedicalDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Parallel fetches while filling the stack in the background. */
const LOAD_CONCURRENCY = 6;

function blitFrame(
  canvas: HTMLCanvasElement,
  frame: DicomFrame,
  preset: string,
  overlays: DicomOverlay[],
  showOverlays: boolean,
) {
  canvas.width = frame.columns;
  canvas.height = frame.rows;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const image = context.createImageData(frame.columns, frame.rows);
  const rgba = rgbaFromFrame(frame, windowForPreset(preset));
  if (showOverlays && overlays.length > 0) {
    compositeOverlays(rgba, frame.rows, frame.columns, overlays);
  }
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
}

export default function DicomSeriesViewer({
  document: focus,
  open,
  onOpenChange,
}: DicomSeriesViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef<
    Map<number, { frame: DicomFrame; overlays: DicomOverlay[] }>
  >(new Map());
  const drawnRef = useRef<{
    frame: DicomFrame;
    preset: string;
    showOverlays: boolean;
  } | null>(null);
  const sliceIndexRef = useRef(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [preset, setPreset] = useState("stored");
  const [showOverlays, setShowOverlays] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const documentId = focus?.id ?? null;

  sliceIndexRef.current = sliceIndex;

  useEffect(() => {
    framesRef.current = new Map();
    drawnRef.current = null;
    setSliceIndex(0);
    setCount(0);
    setLoaded(0);
    setShowOverlays(true);
    setError(null);
    if (!open || documentId == null) {
      return;
    }

    let cancelled = false;
    const inflight = new Set<number>();

    async function loadOne(position: number) {
      const response = await fetch(documentFileUrl(documentId!, position), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Could not load this file.");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const frame = pixelFrameFromPart10(bytes);
      if (!frame) {
        throw new Error(describeUndrawableFrame(bytes));
      }
      return { frame, overlays: overlaysFromPart10(bytes) };
    }

    // Each worker keeps pulling the slice nearest to where the user is.
    async function worker(total: number) {
      while (!cancelled) {
        const position = nextSliceToLoad(
          sliceIndexRef.current,
          total,
          (candidate) =>
            framesRef.current.has(candidate) || inflight.has(candidate),
        );
        if (position == null) {
          return;
        }
        inflight.add(position);
        const entry = await loadOne(position);
        inflight.delete(position);
        if (cancelled) {
          return;
        }
        framesRef.current.set(position, entry);
        setLoaded((current) => current + 1);
      }
    }

    (async () => {
      const response = await fetch(`/api/documents/${documentId}/files`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Could not load this series.");
      }
      const files = (await response.json()) as unknown[];
      if (cancelled) {
        return;
      }
      setCount(files.length);
      await Promise.all(
        Array.from({ length: Math.min(LOAD_CONCURRENCY, files.length) }, () =>
          worker(files.length),
        ),
      );
    })().catch((caught: unknown) => {
      if (!cancelled) {
        setError(caught instanceof Error ? caught.message : "Could not load series");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [open, documentId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const entry = framesRef.current.get(sliceIndex);
    if (!canvas || !entry) {
      return;
    }
    // `loaded` ticks for every background slice; only redraw when ours changed.
    const drawn = drawnRef.current;
    if (
      drawn &&
      drawn.frame === entry.frame &&
      drawn.preset === preset &&
      drawn.showOverlays === showOverlays
    ) {
      return;
    }
    drawnRef.current = { frame: entry.frame, preset, showOverlays };
    blitFrame(canvas, entry.frame, preset, entry.overlays, showOverlays);
  }, [sliceIndex, preset, loaded, showOverlays]);

  const currentEntry = framesRef.current.get(sliceIndex);
  const current = currentEntry?.frame;
  const isMono = current?.kind === "mono16";
  const hasOverlays = (currentEntry?.overlays.length ?? 0) > 0;
  const sliceLabel = count === 0 ? "0 / 0" : `${sliceIndex + 1} / ${count}`;
  const loading = count > 0 && loaded < count;
  const single = count === 1;

  const step = (delta: number) =>
    setSliceIndex((value) => stepSliceIndex(value, delta, count));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl"
        data-testid="dicom-series-viewer"
        onKeyDown={(event) => {
          const delta = sliceDeltaFromKey(event.key);
          if (delta == null || count < 2) {
            return;
          }
          event.preventDefault();
          step(delta);
        }}
      >
        <DialogHeader>
          <DialogTitle>{focus?.title ?? "DICOM series"}</DialogTitle>
          <DialogDescription>
            {single
              ? "Single image."
              : "Stay in this dialog. Use the slider, the mouse wheel, or the arrow keys to move through slices."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" data-testid="dicom-viewer-error">
            {error}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="relative flex justify-center bg-black rounded-lg overflow-hidden">
              <canvas
                ref={canvasRef}
                className="max-w-full max-h-[70vh]"
                data-testid="dicom-viewer-canvas"
                onWheel={(event) => {
                  if (count < 2) {
                    return;
                  }
                  event.preventDefault();
                  step(event.deltaY > 0 ? 1 : -1);
                }}
              />
              {!current && (
                <p
                  className="absolute inset-0 flex items-center justify-center text-sm text-white/70"
                  data-testid="dicom-viewer-loading"
                >
                  Loading slice…
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-4">
              <label
                className="text-sm text-foreground-muted"
                htmlFor="dicom-slice"
                hidden={single}
              >
                Slice{" "}
                <span data-testid="dicom-slice-index">{sliceLabel}</span>
                {loading && (
                  <span className="ml-2 text-foreground-subtle" data-testid="dicom-loaded-count">
                    · loaded {loaded} / {count}
                  </span>
                )}
              </label>
              <div className="flex items-center gap-4">
                {hasOverlays && (
                  <label className="flex items-center gap-2 text-sm text-foreground-muted">
                    <input
                      type="checkbox"
                      checked={showOverlays}
                      onChange={(event) => setShowOverlays(event.target.checked)}
                      data-testid="dicom-overlay-toggle"
                    />
                    Measurements
                  </label>
                )}
                {isMono && (
                  <label className="flex items-center gap-2 text-sm text-foreground-muted">
                    Window
                    <select
                      className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm text-foreground"
                      value={preset}
                      onChange={(event) => setPreset(event.target.value)}
                      data-testid="dicom-window-preset"
                    >
                      {CT_WINDOW_PRESETS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
            </div>
            <input
              id="dicom-slice"
              type="range"
              min={0}
              max={Math.max(count - 1, 0)}
              value={sliceIndex}
              disabled={count < 2}
              onChange={(event) => setSliceIndex(Number(event.target.value))}
              className="w-full"
              data-testid="dicom-slice-slider"
              hidden={single}
            />
            {loading && !single && (
              <div className="h-1 w-full rounded bg-surface-1" aria-hidden="true">
                <div
                  className="h-1 rounded bg-primary transition-[width]"
                  style={{ width: `${(loaded / count) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
