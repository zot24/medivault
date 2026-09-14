import { useEffect, useRef, useState } from "react";
import { documentFileUrl } from "@/lib/owned-file";
import { FrameCache } from "@/lib/frame-cache";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  CT_WINDOW_PRESETS,
  describeUndrawableFrame,
  multiFrameSourceFromPart10,
  overlaysFromPart10,
  pixelFrameFromPart10,
  renderFrameRgba,
  windowForPreset,
  type DicomFrame,
  type DicomOverlay,
  type EncapsulatedJpegSource,
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

/**
 * How many decoded ultrasound cine frames stay resident at once (plan 06).
 * A whole loop never fits: 96 frames of 708x1016 RGBA is ~263 MiB, and the
 * reference disc holds 45 such loops. What is kept for the whole loop is its
 * *compressed* fragments (~100 KB a frame, already downloaded); bitmaps are
 * decoded on demand into this small LRU and re-decoded if they are dropped.
 */
const CINE_RESIDENT_FRAMES = 24;

/** Frames decoded ahead of the one on screen while a loop is playing. */
const CINE_PREFETCH_AHEAD = 4;

type CachedBitmap = {
  kind: "bitmap";
  rows: number;
  columns: number;
  bitmap: ImageBitmap;
};

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

/**
 * How many of `positions` have ever been loaded, per `loadedPositions` — not
 * how many are currently resident in the bounded frame cache. A phase larger
 * than the cache budget keeps evicting earlier frames as later ones load, so
 * cache residency can never reach the phase's full count (plan 04's bounded
 * cache); an ever-loaded set can.
 */
export function countLoaded(positions: number[], loadedPositions: ReadonlySet<number>): number {
  let count = 0;
  for (const position of positions) {
    if (loadedPositions.has(position)) {
      count += 1;
    }
  }
  return count;
}

/** Percentage for the loading progress bar, capped at 100. */
export function loadProgressPercent(loadedInPhase: number, count: number): number {
  if (count <= 0) {
    return 0;
  }
  return Math.min(100, (loadedInPhase / count) * 100);
}

/**
 * The frame a cine loop should be showing after `elapsedMs` of playback at
 * `frameRate` fps, looping back to the start once it runs past the last
 * frame (plan 06 section C).
 */
export function cineFrameAtElapsed(
  elapsedMs: number,
  frameRate: number,
  frameCount: number,
): number {
  if (frameCount <= 0) {
    return 0;
  }
  const framesElapsed = Math.floor((elapsedMs / 1000) * frameRate);
  return framesElapsed % frameCount;
}

/**
 * Which frames of a cine loop to decode next, most urgent first: the frame
 * on screen (unless its bitmap is already resident), then `prefetchAhead`
 * frames after it, wrapping round the end of the loop the way playback
 * does. Frames already decoded are skipped, so a settled window asks for
 * nothing at all.
 */
export function cineFramesToDecode(
  currentIndex: number,
  frameCount: number,
  prefetchAhead: number,
  isResident: (index: number) => boolean,
): number[] {
  if (frameCount <= 0) {
    return [];
  }
  const start = ((currentIndex % frameCount) + frameCount) % frameCount;
  const window = Math.min(frameCount, Math.max(0, prefetchAhead) + 1);
  const wanted: number[] = [];
  for (let step = 0; step < window; step += 1) {
    const index = (start + step) % frameCount;
    if (!isResident(index)) {
      wanted.push(index);
    }
  }
  return wanted;
}

/** Draws a decoded ultrasound cine frame — no window/overlay compositing applies to it. */
function blitBitmap(canvas: HTMLCanvasElement, bitmap: ImageBitmap) {
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  context.drawImage(bitmap, 0, 0);
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
  const rgba = renderFrameRgba(frame, showOverlays ? overlays : [], windowForPreset(preset));
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
  // Positions ever loaded for this document, independent of whether the
  // bounded frame cache has since evicted them -- see `countLoaded`.
  const loadedPositionsRef = useRef<Set<number>>(new Set());
  // One encapsulated JPEG source per multi-frame ultrasound position, kept
  // alongside (not inside) cacheRef: pixelFrameFromPart10 returns null for
  // these, so they never occupy a CachedFrame slot (plan 06).
  const cineSourcesRef = useRef<Map<number, EncapsulatedJpegSource>>(new Map());
  // Decoded bitmaps for the *currently open* cine loop only — a small LRU
  // (CINE_RESIDENT_FRAMES), not the whole loop. Built per loop because its
  // budget depends on that loop's frame size, and dropped (every bitmap
  // closed) whenever the current position changes.
  const cineBitmapsRef = useRef<FrameCache<CachedBitmap> | null>(null);
  // Bumped whenever the open loop changes; a decode in flight for an older
  // token throws its bitmap away instead of filling a cache nobody wants.
  const cineDecodeTokenRef = useRef(0);
  // The token of the decode pump running right now, or null when none is.
  const cineDecodingRef = useRef<number | null>(null);
  // The position cine state was last reset for, so the reset below happens
  // exactly once per real position change and not on every unrelated
  // background-load tick (`loaded` ticks constantly while a CT volume
  // streams in).
  const cineResetPositionRef = useRef<number | null>(null);
  // Playback state the decode pump reads *while it is running*, so it always
  // decodes around the frame that is on screen now — not the one that was
  // when it started.
  const cineFrameIndexRef = useRef(0);
  const cineLoopPlayingRef = useRef(false);

  const [positions, setPositions] = useState<number[]>([]);
  const [phases, setPhases] = useState<Phase[] | null>(null);
  const [selectedPhaseIndex, setSelectedPhaseIndex] = useState(0);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [loaded, setLoaded] = useState(0);
  const [cinePlaying, setCinePlaying] = useState(false);
  const [preset, setPreset] = useState("stored");
  const [showOverlays, setShowOverlays] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ultrasound cine playback (plan 06) — independent of the CT phase-cine
  // state above, which cines across *positions*, not frames of one file.
  const [cineFrameIndex, setCineFrameIndex] = useState(0);
  const [cineLoopPlaying, setCineLoopPlaying] = useState(false);
  // Bumped once per decoded bitmap: it is what makes the draw effect below
  // re-run when the frame it wants finally arrives.
  const [cineDecoded, setCineDecoded] = useState(0);
  const documentId = focus?.id ?? null;

  sliceIndexRef.current = sliceIndex;
  positionsRef.current = positions;
  cineFrameIndexRef.current = cineFrameIndex;
  cineLoopPlayingRef.current = cineLoopPlaying;

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

  async function loadOne(
    position: number,
    signal: AbortSignal,
  ): Promise<CachedFrame | EncapsulatedJpegSource> {
    const response = await fetch(documentFileUrl(documentId!, position), {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      throw new Error("Could not load this file.");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const frame = pixelFrameFromPart10(bytes);
    if (frame) {
      frameCostRef.current =
        frame.rows * frame.columns * (frame.kind === "mono16" ? 2 : 3);
      return { ...frame, overlays: overlaysFromPart10(bytes) };
    }
    // JPEG Baseline multi-frame ultrasound (plan 06): not a pixelFrameFromPart10
    // shape, but every frame is a complete JPEG the browser decodes itself.
    const cine = multiFrameSourceFromPart10(bytes);
    if (cine) {
      return cine;
    }
    throw new Error(describeUndrawableFrame(bytes));
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
          cineSourcesRef.current.has(absolute) ||
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
        if (entry.kind === "jpeg-frames") {
          cineSourcesRef.current.set(absolute, entry);
        } else {
          cacheRef.current.set(absolute, entry);
        }
        loadedPositionsRef.current.add(absolute);
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

  /** Drops the open loop's decoded bitmaps (closing each) and stops any decode in flight. */
  function resetCineBitmaps() {
    cineDecodeTokenRef.current += 1;
    cineBitmapsRef.current?.clear();
    cineBitmapsRef.current = null;
  }

  /** The bitmap LRU for this loop: CINE_RESIDENT_FRAMES frames of its own size. */
  function cineBitmapsFor(source: EncapsulatedJpegSource): FrameCache<CachedBitmap> {
    const existing = cineBitmapsRef.current;
    if (existing) {
      return existing;
    }
    const created = new FrameCache<CachedBitmap>(
      Math.max(1, source.rows * source.columns * 4) * CINE_RESIDENT_FRAMES,
      { dispose: (entry) => entry.bitmap.close() },
    );
    cineBitmapsRef.current = created;
    return created;
  }

  /**
   * Decodes what playback is about to draw, one frame at a time, until the
   * window around the current frame is resident. One pump runs per loop, and
   * it re-reads the current frame on every turn — so scrubbing or pressing
   * play mid-decode just changes what it decodes next.
   */
  function pumpCineDecode(source: EncapsulatedJpegSource) {
    const token = cineDecodeTokenRef.current;
    if (cineDecodingRef.current === token) {
      return;
    }
    // A pump left over from a previous loop may still be awaiting a decode;
    // claiming the ref makes it stop at its next check instead of this loop
    // waiting on it.
    cineDecodingRef.current = token;
    const cache = cineBitmapsFor(source);
    (async () => {
      while (!cancelledRef.current && token === cineDecodeTokenRef.current) {
        const [next] = cineFramesToDecode(
          cineFrameIndexRef.current,
          source.frameCount,
          cineLoopPlayingRef.current ? CINE_PREFETCH_AHEAD : 0,
          (index) => cache.has(index),
        );
        if (next == null) {
          return;
        }
        const bitmap = await createImageBitmap(
          new Blob([source.frame(next)], { type: "image/jpeg" }),
        );
        if (cancelledRef.current || token !== cineDecodeTokenRef.current) {
          bitmap.close();
          return;
        }
        // Pin the frame on screen, so prefetching ahead can never evict it.
        cache.protect([cineFrameIndexRef.current]);
        cache.set(next, {
          kind: "bitmap",
          rows: source.rows,
          columns: source.columns,
          bitmap,
        });
        setCineDecoded((count) => count + 1);
      }
    })()
      .catch(() => {
        if (!cancelledRef.current && token === cineDecodeTokenRef.current) {
          setError("Could not decode this cine loop.");
        }
      })
      .finally(() => {
        if (cineDecodingRef.current === token) {
          cineDecodingRef.current = null;
        }
      });
  }

  useEffect(() => {
    const controller = new AbortController();
    cacheRef.current.clear();
    frameCostRef.current = null;
    drawnRef.current = null;
    inflightRef.current = new Set();
    loadedPositionsRef.current = new Set();
    cineSourcesRef.current = new Map();
    resetCineBitmaps();
    cineResetPositionRef.current = null;
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
    setCineFrameIndex(0);
    setCineLoopPlaying(false);
    setCineDecoded(0);
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
      resetCineBitmaps();
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

  // A different position is a different loop: drop the last one's decoded
  // bitmaps and rewind. The refs are set alongside the state so the decode
  // pump below, which runs in this same commit, already sees frame 0.
  useEffect(() => {
    const absolute = positions[sliceIndex] ?? null;
    if (absolute === cineResetPositionRef.current) {
      return;
    }
    cineResetPositionRef.current = absolute;
    resetCineBitmaps();
    cineFrameIndexRef.current = 0;
    cineLoopPlayingRef.current = false;
    setCineFrameIndex(0);
    setCineLoopPlaying(false);
    setCineDecoded(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceIndex, positions]);

  // Ultrasound cine playback (plan 06): decode the frames playback is about
  // to need, and only those. A whole loop's bitmaps don't fit in memory
  // (see CINE_RESIDENT_FRAMES), but its compressed JPEG fragments are
  // already downloaded and stay in memory — so a frame the LRU dropped
  // costs one ~4 ms createImageBitmap when the loop comes round to it
  // again, with no extra network fetch. Runs on every change that can
  // create decode work: the position, the frame on screen, play/pause, and
  // `loaded` (which is when the source itself arrives).
  useEffect(() => {
    const absolute = positions[sliceIndex] ?? null;
    const source = absolute == null ? undefined : cineSourcesRef.current.get(absolute);
    if (!source) {
      return;
    }
    pumpCineDecode(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceIndex, positions, loaded, cineFrameIndex, cineLoopPlaying, cineDecoded]);

  // Advances the current frame by elapsed time x the loop's own frame rate,
  // looping. Playback runs on wall-clock time whether or not a frame's
  // bitmap is resident yet; the decode pump above chases it.
  useEffect(() => {
    if (!cineLoopPlaying) {
      return;
    }
    const absolute = positions[sliceIndex];
    const source = absolute == null ? undefined : cineSourcesRef.current.get(absolute);
    if (!source || !source.frameRate || source.frameCount < 2) {
      setCineLoopPlaying(false);
      return;
    }
    const frameRate = source.frameRate;
    const frameCount = source.frameCount;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      setCineFrameIndex(cineFrameAtElapsed(now - start, frameRate, frameCount));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [cineLoopPlaying, sliceIndex, positions]);

  // Draws the current cine frame as soon as its bitmap exists. While it
  // doesn't — not decoded yet, or evicted and being decoded again — the
  // previous frame stays up for those few milliseconds rather than the
  // canvas flashing black; `cineDecoded` re-runs this the moment it lands.
  useEffect(() => {
    const canvas = canvasRef.current;
    const absolute = positions[sliceIndex];
    const hasCine = absolute != null && cineSourcesRef.current.has(absolute);
    if (!canvas || !hasCine) {
      return;
    }
    const entry = cineBitmapsRef.current?.get(cineFrameIndex);
    if (!entry) {
      return;
    }
    blitBitmap(canvas, entry.bitmap);
  }, [cineFrameIndex, sliceIndex, positions, cineDecoded]);

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
  const currentCine =
    currentAbsolute == null ? undefined : cineSourcesRef.current.get(currentAbsolute);
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
  const loadedInPhase = countLoaded(positions, loadedPositionsRef.current);
  const loading = count > 0 && loadedInPhase < count;
  const single = count === 1;
  const isCinePlayable = !!currentCine && currentCine.frameRate != null && currentCine.frameCount > 1;
  const cineFrameLabel = currentCine ? `${cineFrameIndex + 1} / ${currentCine.frameCount}` : "";
  const hasDrawnContent = current !== undefined || (currentCine !== undefined && cineDecoded > 0);

  const step = (delta: number) =>
    setSliceIndex((value) => stepSliceIndex(value, delta, count));
  const stepCineFrame = (delta: number) =>
    setCineFrameIndex((value) => stepSliceIndex(value, delta, currentCine?.frameCount ?? 0));

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
            return;
          }
          // Arrow keys / space bar step or play the current cine loop's
          // frames when there's no position slider competing for them
          // (a lone cine record — see shared/dicom-frame.ts, plan 06).
          if (currentCine && currentCine.frameCount > 1) {
            if (delta != null) {
              event.preventDefault();
              stepCineFrame(delta);
              return;
            }
            if (event.key === " ") {
              event.preventDefault();
              setCineLoopPlaying((playing) => !playing);
            }
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{focus?.title ?? "DICOM series"}</DialogTitle>
          <DialogDescription>
            {isCinePlayable
              ? "Cine loop. Press play, or use the frame slider / arrow keys / space bar to scrub and play."
              : single
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
              {!hasDrawnContent && (
                <p
                  className="absolute inset-0 flex items-center justify-center text-sm text-white/70"
                  data-testid="dicom-viewer-loading"
                >
                  Loading slice…
                </p>
              )}
            </div>
            {currentCine && currentCine.frameCount > 1 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <label className="text-sm text-foreground-muted">
                    Frame{" "}
                    <span data-testid="dicom-cine-frame-index">{cineFrameLabel}</span>
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!isCinePlayable}
                    onClick={() => setCineLoopPlaying((playing) => !playing)}
                    data-testid="dicom-play"
                  >
                    {cineLoopPlaying ? "Pause" : "Play"}
                  </Button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(currentCine.frameCount - 1, 0)}
                  value={cineFrameIndex}
                  onChange={(event) => {
                    setCineLoopPlaying(false);
                    setCineFrameIndex(Number(event.target.value));
                  }}
                  className="w-full"
                  data-testid="dicom-frame-slider"
                />
              </div>
            )}
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
                    Annotations
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
                  style={{ width: `${loadProgressPercent(loadedInPhase, count)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
