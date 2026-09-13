import { useEffect, useRef, useState } from "react";
import { documentFileUrl } from "@/lib/owned-file";
import { FrameCache } from "@/lib/frame-cache";
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
import { detectPhases, type Phase } from "@shared/phases";
import type { MedicalDocument } from "@shared/schema";

type DicomSeriesViewerProps = {
  document: MedicalDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Parallel fetches while filling the stack in the background. */
const LOAD_CONCURRENCY = 6;

/** Frames within this many positions of the current one are never evicted. */
const PROTECT_RADIUS = 8;

/** Default frame-cache budget: keeps a 5,800-slice series well under a 4 GB tab limit. */
const CACHE_BUDGET_BYTES = 512 * 1024 * 1024;

/** How often the current slice advances a phase while cine-ing through the cardiac cycle. */
const CINE_INTERVAL_MS = 100;

type FileRow = {
  position: number;
  instanceNumber: number | null;
  sliceLocation: number | null;
  phase: number | null;
};

type CachedFrame = DicomFrame & { overlays: DicomOverlay[] };

/** "70 %" -> "Phase 70 %"; "Phase 1" is left as-is. */
function phaseChipLabel(label: string): string {
  return label.startsWith("Phase") ? label : `Phase ${label}`;
}

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
  const cacheRef = useRef(new FrameCache<CachedFrame>(CACHE_BUDGET_BYTES));
  const frameCostRef = useRef<number | null>(null);
  const drawnRef = useRef<{
    frame: DicomFrame;
    preset: string;
    showOverlays: boolean;
  } | null>(null);
  const positionsRef = useRef<number[]>([]);
  const sliceIndexRef = useRef(0);
  const activeWorkersRef = useRef(0);
  const inflightRef = useRef<Set<number>>(new Set());
  const cancelledRef = useRef(false);

  const [positions, setPositions] = useState<number[]>([]);
  const [phases, setPhases] = useState<Phase[] | null>(null);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [preset, setPreset] = useState("stored");
  const [showOverlays, setShowOverlays] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const documentId = focus?.id ?? null;

  sliceIndexRef.current = sliceIndex;
  positionsRef.current = positions;

  function isWanted(relativeIndex: number): boolean {
    const distance = Math.abs(relativeIndex - sliceIndexRef.current);
    if (distance <= PROTECT_RADIUS) {
      return true;
    }
    const cost = frameCostRef.current;
    if (!cost) {
      return true;
    }
    const framesInBudget = Math.max(
      PROTECT_RADIUS * 2 + 1,
      Math.floor(CACHE_BUDGET_BYTES / cost),
    );
    return distance <= Math.floor(framesInBudget / 2);
  }

  async function loadOne(position: number, signal: AbortSignal): Promise<CachedFrame> {
    const response = await fetch(documentFileUrl(documentId!, position), {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      throw new Error("Could not load this file.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const frame = pixelFrameFromPart10(bytes);
    if (!frame) {
      throw new Error(describeUndrawableFrame(bytes));
    }
    frameCostRef.current =
      frame.rows * frame.columns * (frame.kind === "mono16" ? 2 : 3);
    return { ...frame, overlays: overlaysFromPart10(bytes) };
  }

  function protectAroundCurrentSlice() {
    const list = positionsRef.current;
    const around = sliceIndexRef.current;
    const protectedPositions: number[] = [];
    for (
      let relative = Math.max(0, around - PROTECT_RADIUS);
      relative <= Math.min(list.length - 1, around + PROTECT_RADIUS);
      relative += 1
    ) {
      protectedPositions.push(list[relative]);
    }
    cacheRef.current.protect(protectedPositions);
  }

  function kickLoaders(signal: AbortSignal) {
    while (activeWorkersRef.current < LOAD_CONCURRENCY) {
      activeWorkersRef.current += 1;
      runWorker(signal).finally(() => {
        activeWorkersRef.current -= 1;
      });
    }
  }

  async function runWorker(signal: AbortSignal) {
    while (!cancelledRef.current) {
      const list = positionsRef.current;
      const relative = nextSliceToLoad(sliceIndexRef.current, list.length, (candidate) => {
        const absolute = list[candidate];
        return (
          cacheRef.current.has(absolute) ||
          inflightRef.current.has(absolute) ||
          !isWanted(candidate)
        );
      });
      if (relative == null) {
        return;
      }
      const absolute = list[relative];
      inflightRef.current.add(absolute);
      try {
        const entry = await loadOne(absolute, signal);
        if (cancelledRef.current) {
          return;
        }
        cacheRef.current.set(absolute, entry);
        setLoaded((current) => current + 1);
      } catch (caught: unknown) {
        if (!cancelledRef.current && !(caught instanceof DOMException && caught.name === "AbortError")) {
          setError(caught instanceof Error ? caught.message : "Could not load series");
        }
        return;
      } finally {
        inflightRef.current.delete(absolute);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    cacheRef.current.clear();
    frameCostRef.current = null;
    drawnRef.current = null;
    inflightRef.current = new Set();
    activeWorkersRef.current = 0;
    cancelledRef.current = false;
    setPositions([]);
    setPhases(null);
    setSelectedPhaseIndex(0);
    setSliceIndex(0);
    setLoaded(0);
    setCinePlaying(false);
    setShowOverlays(true);
    setError(null);
    if (!open || documentId == null) {
      return;
    }

    (async () => {
      const response = await fetch(`/api/documents/${documentId}/files`, {
        credentials: "include",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Could not load this series.");
      }
      const files = (await response.json()) as FileRow[];
      if (cancelledRef.current) {
        return;
      }
      const detection = detectPhases(
        files.map((file) => ({
          position: file.position,
          instanceNumber: file.instanceNumber,
          sliceLocation: file.sliceLocation,
          phase: file.phase,
        })),
      );
      const allPositions = files.map((file) => file.position);
      setPhases(detection?.phases ?? null);
      setPositions(detection ? detection.phases[0].positions : allPositions);
      kickLoaders(controller.signal);
    })().catch((caught: unknown) => {
      if (!cancelledRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not load series");
      }
    });

    return () => {
      cancelledRef.current = true;
      controller.abort();
      cacheRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, documentId]);

  // Selecting a phase swaps which positions the slider ranges over. The
  // slice index itself is kept (clamped) rather than reset, so cine-ing
  // through phases holds the same anatomical slice steady across phases —
  // that's the point of wall-motion review.
  useEffect(() => {
    if (!phases) {
      return;
    }
    const nextPositions = phases[selectedPhaseIndex]?.positions ?? [];
    setPositions(nextPositions);
    setSliceIndex((current) => Math.min(current, Math.max(nextPositions.length - 1, 0)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPhaseIndex, phases]);

  // Resumes background loading whenever the visible window moves (scrolling
  // the slider, changing phase) instead of only once on open.
  useEffect(() => {
    if (!open || documentId == null || positions.length === 0) {
      return;
    }
    protectAroundCurrentSlice();
    const controller = new AbortController();
    kickLoaders(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceIndex, positions]);

  // Space bar cines through phases at the current slice — how cardiologists
  // scan for wall motion. Stops automatically if phases go away.
  useEffect(() => {
    if (!cinePlaying || !phases || phases.length < 2) {
      return;
    }
    const id = setInterval(() => {
      setSelectedPhaseIndex((index) => (index + 1) % phases.length);
    }, CINE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [cinePlaying, phases]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const absolute = positions[sliceIndex];
    const entry = absolute == null ? undefined : cacheRef.current.get(absolute);
    if (!canvas || !entry) {
      return;
    }
    // `loaded` ticks for every background slice; only redraw when ours changed.
    const drawn = drawnRef.current;
    if (
      drawn &&
      drawn.frame === entry &&
      drawn.preset === preset &&
      drawn.showOverlays === showOverlays
    ) {
      return;
    }
    drawnRef.current = { frame: entry, preset, showOverlays };
    blitFrame(canvas, entry, preset, entry.overlays, showOverlays);
  }, [sliceIndex, positions, preset, loaded, showOverlays]);

  const currentAbsolute = positions[sliceIndex];
  const current = currentAbsolute == null ? undefined : cacheRef.current.get(currentAbsolute);
  const isMono = current?.kind === "mono16";
  const hasOverlays = (current?.overlays.length ?? 0) > 0;
  const count = positions.length;
  const currentPhase = phases ? phases[selectedPhaseIndex] : null;
  const sliceLabel =
    count === 0
      ? "0 / 0"
      : currentPhase
        ? `${sliceIndex + 1} / ${count} · ${phaseChipLabel(currentPhase.label)}`
        : `${sliceIndex + 1} / ${count}`;
  const loadedInPhase = positions.filter((position) => cacheRef.current.has(position)).length;
  const loading = count > 0 && loadedInPhase < count;
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
          if (delta != null && count >= 2) {
            event.preventDefault();
            step(delta);
            return;
          }
          if (event.key === " " && phases && phases.length >= 2) {
            event.preventDefault();
            setCinePlaying((playing) => !playing);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{focus?.title ?? "DICOM series"}</DialogTitle>
          <DialogDescription>
            {single
              ? "Single image."
              : "Stay in this dialog. Use the slider, the mouse wheel, or the arrow keys to move through slices. Space bar cines through phases."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" data-testid="dicom-viewer-error">
            {error}
          </p>
        ) : (
          <div className="space-y-4">
            {phases && (
              <label className="flex items-center gap-2 text-sm text-foreground-muted">
                Phase
                <select
                  className="rounded-md border border-border bg-surface-1 px-2 py-1 text-sm text-foreground"
                  value={selectedPhaseIndex}
                  onChange={(event) => {
                    setCinePlaying(false);
                    setSelectedPhaseIndex(Number(event.target.value));
                  }}
                  data-testid="dicom-phase-select"
                >
                  {phases.map((phase, index) => (
                    <option key={phase.key} value={index}>
                      {phase.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
                    · loaded {loadedInPhase} / {count}
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
                  style={{ width: `${(loadedInPhase / count) * 100}%` }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
