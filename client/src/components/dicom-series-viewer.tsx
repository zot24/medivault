import { useEffect, useRef, useState } from "react";
import { ScanLine } from "lucide-react";
import { fileUrl, filesListUrl, frameRangeUrl, frameUrl } from "@/lib/file-source";
import { useFileSource } from "@/lib/file-source-context";
import { FrameCache } from "@/lib/frame-cache";
import { frameBatches, preloadFrames } from "@/lib/range-preload";
import { useThumbnail } from "@/lib/thumbnails";
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
  multiFrameSourceFromPart10,
  overlaysFromPart10,
  pixelFrameFromPart10,
  renderFrameRgba,
  undrawableFrameMessage,
  windowForPreset,
  type DicomFrame,
  type DicomMono8Frame,
  type DicomOverlay,
  type EncapsulatedJpegSource,
} from "@shared/dicom-frame";
import {
  nextSliceToLoad,
  sliceDeltaFromKey,
  stepSliceIndex,
} from "@shared/upload-kinds";
import { detectPhases, type Phase } from "@shared/phases";
import { runLabel, seriesKind, viewLabel, type SeriesKind } from "@shared/series-kind";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import type { MedicalDocument } from "@shared/schema";

type DicomSeriesViewerProps = {
  document: MedicalDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Which file's *position* to open on (plan 13 section D: clicking a
   * thumbnail in the study page's inline view/run strip jumps straight to
   * that view, instead of always opening on position 0). Applied once, when
   * the file list first loads for this open — not on every render, so
   * scrubbing afterward isn't fought.
   */
  initialPosition?: number;
};

/** Parallel fetches while filling the stack in the background. */
const LOAD_CONCURRENCY = 6;

/** Frames within this many positions of the current one are never evicted. */
const PROTECT_RADIUS = 8;

/** Default frame-cache budget: keeps a 5,800-slice series well under a 4 GB tab limit. */
const CACHE_BUDGET_BYTES = 512 * 1024 * 1024;

/**
 * Budget for retained cine *files* (plan 06). An EncapsulatedJpegSource
 * closes over the whole file it was parsed from — that is what makes
 * decoding a frame on demand cheap, and what makes keeping every one of
 * them ruinous: the reference echo record is 56 files of ~9.6 MB, ~500 MB
 * if they all land. Separate from CACHE_BUDGET_BYTES because it bounds
 * compressed bytes rather than decoded frames, and a record is one modality
 * in practice, so the two budgets are never both full at once.
 */
const CINE_SOURCE_BUDGET_BYTES = 64 * 1024 * 1024;

/**
 * Cine files are ~20x a CT slice, so they get a far tighter protect radius
 * than PROTECT_RADIUS: the open loop and its immediate neighbours, enough
 * that stepping to the next loop is instant.
 */
const CINE_PROTECT_RADIUS = 1;

/** How often the current slice advances a phase while cine-ing through the cardiac cycle. */
const CINE_INTERVAL_MS = 100;

/**
 * How many *rasterized* cine frames stay resident at once (plan 06). A
 * whole loop never fits: 96 frames of 708x1016 RGBA is ~263 MiB, and the
 * reference disc holds 45 such loops. For an ultrasound cine (plan 06),
 * what is kept for the whole loop is its *compressed* JPEG fragments
 * (~100 KB a frame, already downloaded); bitmaps are decoded on demand into
 * this small LRU and re-decoded if they are dropped. For an angiography run
 * (plan 07 section D), the whole run's *raw* 8-bit bytes are kept
 * separately (rangeRawFramesRef, RANGE_RAW_CACHE_BUDGET_BYTES) — this LRU
 * bounds only how many of them are rasterized to RGBA for drawing at once.
 */
const CINE_RESIDENT_FRAMES = 24;

/** Frames decoded ahead of the one on screen while a loop is playing. */
const CINE_PREFETCH_AHEAD = 4;

/**
 * Parallel HTTP range requests while preloading an angiography run (plan
 * 07) — a fetch per frame has real network latency, unlike decoding an
 * already-downloaded JPEG fragment, so fetching the run one frame at a time
 * would take many times longer than it needs to.
 */
const RANGE_PRELOAD_CONCURRENCY = 4;

/**
 * Frames per batch range request while preloading an angiography run (plan
 * 12 section 2) — matches the server's own bound (MAX_FRAME_RANGE in
 * server/document-files.ts) so every batch this client asks for is one the
 * server will actually serve.
 */
const RANGE_BATCH_SIZE = 8;

/**
 * Budget for an angiography run's *raw* frame bytes (plan 07 section D,
 * second-round review): the whole run — up to ~108 frames of ~1 MB each,
 * ~100 MB — is preloaded before Play is enabled, kept as raw 8-bit pixel
 * bytes (not rasterized RGBA, which would be 4x the size) in its own
 * per-run cache separate from CINE_RESIDENT_FRAMES' small bitmap LRU below.
 * 160 MB comfortably covers the reference runs with headroom; a pathological
 * run bigger than that still plays, just with earlier frames evicted LRU-style
 * like any bounded cache. Dropped entirely on a position change or dialog
 * close (resetCineBitmaps), never carried between runs.
 */
const RANGE_RAW_CACHE_BUDGET_BYTES = 160 * 1024 * 1024;

type CachedBitmap = {
  kind: "bitmap";
  rows: number;
  columns: number;
  bitmap: ImageBitmap;
};

/** A decoded angiography frame (plan 07), windowed and rasterized up front — there is no browser-native decoder for it the way there is for JPEG. */
type CachedRaster = {
  kind: "raster";
  rows: number;
  columns: number;
  rgba: Uint8ClampedArray;
};

type CachedCineFrame = CachedBitmap | CachedRaster;

/** One angiography frame's raw 8-bit pixel bytes (plan 07), as fetched — not yet windowed/rasterized. See RANGE_RAW_CACHE_BUDGET_BYTES. */
export type RawFrame = {
  kind: "raw8";
  rows: number;
  columns: number;
  bytes: Uint8Array;
  byteCost: number;
};

/**
 * Builds one raw frame's cache entry out of a batch range-read response
 * (plan 12's `pumpRangePreload`, up to RANGE_BATCH_SIZE frames sharing one
 * ArrayBuffer). Always copies (`.slice()`), never `.subarray()`s a view:
 * `rangeRawFramesRef`'s LRU charges each entry only its own `frameBytes`
 * (RANGE_RAW_CACHE_BUDGET_BYTES), so a view over the whole shared batch
 * buffer would keep that entire buffer reachable — up to
 * RANGE_BATCH_SIZE x frameBytes — for as long as any single one of its
 * frames stays resident, silently invalidating the cache's byte-budget
 * accounting once eviction starts dropping some-but-not-all of a batch's
 * frames.
 */
export function rawFrameFromBatch(
  batchBytes: Uint8Array,
  indexInBatch: number,
  frameBytes: number,
  rows: number,
  columns: number,
): RawFrame {
  const offset = indexInBatch * frameBytes;
  return {
    kind: "raw8",
    rows,
    columns,
    bytes: batchBytes.slice(offset, offset + frameBytes),
    byteCost: frameBytes,
  };
}

/**
 * One playable multi-frame *file* (as opposed to CachedFrame, one *slice*):
 * either a whole downloaded encapsulated JPEG cine (plan 06) with frames
 * decoded on demand, or an uncompressed angiography run (plan 07) whose
 * frames are fetched one HTTP range request at a time and never held whole.
 */
type CineSource = EncapsulatedJpegSource | RangeCineSource;

export type RangeCineSource = {
  kind: "range-frames";
  rows: number;
  columns: number;
  frameCount: number;
  frameRate: number | null;
  windowCenter: number;
  windowWidth: number;
  /** One frame's bytes — what discovering this source costs, not the whole run (see CINE_SOURCE_BUDGET_BYTES). */
  byteCost: number;
  frame(index: number, signal?: AbortSignal): Promise<Uint8Array>;
  /** `from`..`to` inclusive frames' raw bytes, back to back (plan 12) — the batch counterpart to `frame`. */
  frameRange(from: number, to: number, signal?: AbortSignal): Promise<Uint8Array>;
};

/** Present only for an uncompressed multi-frame file (plan 07/12) — see server/routes.ts. */
type FileRowFrameIndex = {
  numberOfFrames: number;
  frameBytes: number;
  rows: number;
  columns: number;
};

type FileRow = {
  position: number;
  instanceNumber: number | null;
  sliceLocation: number | null;
  phase: number | null;
  frameIndex: FileRowFrameIndex | null;
  // Plan 13 (multi-view navigation): this file's own header fields, used to
  // label one thumbnail of the view/run strip — see shared/series-kind.ts.
  imageType: string[] | null;
  positionerPrimaryAngle: number | null;
  positionerSecondaryAngle: number | null;
  usRegionDataTypes: number[] | null;
  numberOfFrames: number | null;
  frameRate: number | null;
};

/** One thumbnail of the view/run strip (plan 13 section C/D). */
function ViewStripThumb({
  documentId,
  position,
  dicomMeta,
  label,
  selected,
  onSelect,
  testId,
}: {
  documentId: number;
  position: number;
  dicomMeta: DicomSeriesMeta | null;
  label: string;
  selected: boolean;
  onSelect: () => void;
  testId: string;
}) {
  const dataUrl = useThumbnail(documentId, position, dicomMeta);
  return (
    <button
      type="button"
      onClick={onSelect}
      data-testid={testId}
      className={`flex-shrink-0 w-24 text-left rounded-md border-2 transition-colors ${
        selected ? "border-primary" : "border-transparent"
      }`}
    >
      <div className="w-24 h-24 rounded bg-black/80 flex items-center justify-center overflow-hidden">
        {dataUrl ? (
          <img src={dataUrl} alt="" className="w-full h-full object-contain" />
        ) : (
          <ScanLine className="h-5 w-5 text-white/50" />
        )}
      </div>
      <p className="mt-1 text-xs text-foreground-muted font-body truncate px-0.5" title={label}>
        {label}
      </p>
    </button>
  );
}

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

/**
 * How far from the current position the background loaders may run, in
 * positions, so that everything they fetch fits `budgetBytes`.
 *
 * `costBytes` is what one loaded position pins in memory — a decoded frame
 * for a CT slice, the whole file for a cine loop (see
 * EncapsulatedJpegSource.byteCost). The 2r+1 positions in the window have
 * to fit the budget: want more than fits and the loaders would spend
 * forever refetching what the cache had just evicted to make room for them.
 *
 * Returns Infinity only before the first file of a record has landed, while
 * the cost is still unknown — that first fetch is what reveals it.
 * `minRadius` floors the result so the current position and its immediate
 * neighbours stay loadable even when one of them alone exceeds the budget.
 */
export function loadRadius(
  costBytes: number | null,
  budgetBytes: number,
  minRadius: number,
): number {
  if (costBytes == null || costBytes <= 0) {
    return Infinity;
  }
  return Math.max(minRadius, Math.floor((budgetBytes / costBytes - 1) / 2));
}

/**
 * Plan 13's view/run strip mounts one ViewStripThumb per file, and each one
 * fires its own `useThumbnail` fetch — a whole-file fetch for a
 * JPEG-compressed cine (thumbnail-frame-source.ts's cheap frame-range path
 * only applies to an *uncompressed* multi-frame file at position 0), so an
 * unbounded strip for a 56-view echo record would fire 56 of those at
 * once. Only a thumbnail within `radius` of the current selection actually
 * mounts (`isViewStripThumbLoaded`); everything else renders a plain,
 * still-clickable placeholder until scrolled or clicked into range — the
 * same cap in spirit as the study page's own inline strip (section D's
 * VIEW_STRIP_PREVIEW_LIMIT), but centered on the current view instead of
 * always the first few, since every position here has to stay reachable
 * via ←/→.
 */
export const VIEW_STRIP_LOAD_RADIUS = 8;

export function isViewStripThumbLoaded(
  index: number,
  selectedIndex: number,
  radius: number = VIEW_STRIP_LOAD_RADIUS,
): boolean {
  return Math.abs(index - selectedIndex) <= radius;
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
 * How many resident frames of runway playback wants beyond wherever it is
 * (plan 12 section 1): the full 30-frame buffer, or however many frames are
 * left in the run if that's fewer.
 */
const PROGRESSIVE_PLAY_BUFFER = 30;

/**
 * Whether playback can show `playhead` right now, given `resident` frames
 * loaded (front-to-back, as the whole-run preload always fills them) out of
 * `total`. One decision serves two moments: called with `playhead` 0, it's
 * whether Play unlocks at all — the first `min(30, total)` frames have to be
 * resident, not the whole run. Called with the playhead during playback,
 * it's whether to keep advancing or hold on the last resident frame
 * ("buffering…") until the preload — which keeps running ahead of the
 * playhead in the background — has built the runway back up. Always false
 * for an empty run.
 */
export function canPlay(resident: number, playhead: number, total: number): boolean {
  if (total <= 0) {
    return false;
  }
  const position = ((playhead % total) + total) % total;
  const needed = Math.min(PROGRESSIVE_PLAY_BUFFER, total - position);
  return resident - position >= needed;
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

/** Draws an already-windowed angiography frame (plan 07) — rgba came out of renderFrameRgba, not the browser's own decoder. */
function blitRaster(canvas: HTMLCanvasElement, rows: number, columns: number, rgba: Uint8ClampedArray) {
  canvas.width = columns;
  canvas.height = rows;
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }
  const image = context.createImageData(columns, rows);
  image.data.set(rgba);
  context.putImageData(image, 0, 0);
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
  initialPosition,
}: DicomSeriesViewerProps) {
  const fileSource = useFileSource();
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
  // One cine source per multi-frame position, kept alongside (not inside)
  // cacheRef: pixelFrameFromPart10 returns null for these, so they never
  // occupy a CachedFrame slot. An EncapsulatedJpegSource pins a whole
  // downloaded file (plan 06, ~9.6 MB); a RangeCineSource (plan 07) pins
  // nothing but its own metadata — its frames are fetched on demand and
  // never held whole. Bounded on CINE_SOURCE_BUDGET_BYTES either way.
  const cineSourcesRef = useRef(
    new FrameCache<CineSource>(CINE_SOURCE_BUDGET_BYTES),
  );
  // The largest cine file seen in this record, which is what sizes the
  // loaders' window over it. Largest rather than latest so a small still
  // early in the record can't widen the window for the loops after it.
  const cineCostRef = useRef<number | null>(null);
  // Decoded frames for the *currently open* cine loop only — a small LRU
  // (CINE_RESIDENT_FRAMES), not the whole loop. Built per loop because its
  // budget depends on that loop's frame size, and dropped (every bitmap
  // closed) whenever the current position changes. Holds decoded JPEG
  // bitmaps (plan 06) or rasterized angiography frames (plan 07).
  const cineBitmapsRef = useRef<FrameCache<CachedCineFrame> | null>(null);
  // frameCount for every position with an uncompressed frame index (plan
  // 07), from the files list fetch — lets loadOne take the range-request
  // path for that position without downloading the whole file to find out.
  const rangeFrameCountRef = useRef<Map<number, number>>(new Map());
  // One frame's byte size for the same positions (plan 12's frameIndex,
  // from the same files list fetch) — how a batch range response gets
  // split back into individual frames, and RangeCineSource's own byteCost,
  // without a probe fetch of frame 0 just to learn it.
  const rangeFrameBytesRef = useRef<Map<number, number>>(new Map());
  // The dialog's own lifetime AbortController (open -> close/change
  // document), as opposed to the shorter-lived one the background slice
  // loaders use (aborted on every sliceIndex change). Every range fetch for
  // an angiography run's frames — the bulk preload and the on-demand
  // decode-pump fallback alike — is wired to this one, so closing the
  // dialog mid-preload actually cancels the outstanding HTTP requests
  // instead of letting ~100 MB keep downloading in the background.
  const dialogAbortRef = useRef<AbortController | null>(null);
  // Raw (undecoded) frame bytes for the currently open angiography run
  // (plan 07 section D) — the whole run, not a resident window, bounded at
  // RANGE_RAW_CACHE_BUDGET_BYTES. Separate from cineBitmapsRef (below),
  // which holds a small LRU of *rasterized* frames for drawing. Cleared by
  // resetCineBitmaps on every position change and on dialog close.
  const rangeRawFramesRef = useRef(new FrameCache<RawFrame>(RANGE_RAW_CACHE_BUDGET_BYTES));
  // Preload progress for the currently open angiography run: how many
  // frames counting from 0 are resident (or permanently given up on — see
  // permanentlyMissingRef) with no gap, out of its total frame count (plan
  // 12: `canPlay`'s `resident` reads this as "frames 0..resident-1 are
  // ready", so it has to be a contiguous prefix, not just a raw count of
  // completions — batches can land out of order under concurrency). Kept
  // in lockstep with residentPrefixRef below — see pumpRangePreload.
  const rangePreloadedRef = useRef(0);
  // The contiguous-from-zero count above, as the actual pointer
  // pumpRangePreload advances: `while (raw.has(p) || permanentlyMissingRef.has(p)) p++`.
  const residentPrefixRef = useRef(0);
  // Frames a batch gave up on after every retry (plan 12) — treated as
  // "resolved" for residentPrefixRef's purposes (pumpCineDecode's on-demand
  // path still fetches them individually when actually shown), so one dead
  // frame doesn't freeze the whole run's progressive-play gate forever.
  const permanentlyMissingRef = useRef<Set<number>>(new Set());
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
  // Which RangeCineSource pumpRangePreload has already been started for
  // (plan 07), so a re-run of the effect below (e.g. `loaded` ticking)
  // doesn't restart the bulk preload every time.
  const rangePreloadStartedForRef = useRef<RangeCineSource | null>(null);
  // Playback state the decode pump reads *while it is running*, so it always
  // decodes around the frame that is on screen now — not the one that was
  // when it started.
  const cineFrameIndexRef = useRef(0);
  const cineLoopPlayingRef = useRef(false);

  const [positions, setPositions] = useState<number[]>([]);
  const [phases, setPhases] = useState<Phase[] | null>(null);
  // Plan 13: "views" (echo) and "runs" (angiography) swap the position
  // slider for a thumbnail strip — see the render below and
  // shared/series-kind.ts. Null for a document with no dicomMeta, or before
  // the files list has loaded.
  const [kind, setKind] = useState<SeriesKind | null>(null);
  const [viewLabels, setViewLabels] = useState<Map<number, string>>(new Map());
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
  // How many of the currently-open angiography run's frames have been
  // preloaded into rangeRawFramesRef, out of its total frame count (plan 07
  // section D) — drives the "Loading N / M" progress and gates Play
  // (isCinePlayable) until it reaches the total.
  const [rangePreloaded, setRangePreloaded] = useState(0);
  // Frames the whole-run preload gave up on after retries; they are fetched
  // on demand when shown, so playback still works with a short hiccup.
  const [rangeMissing, setRangeMissing] = useState(0);
  // True while playback is holding on the last resident frame because it
  // has caught up with the preload (plan 12's canPlay, checked every tick
  // of the playback loop below) — shown as "buffering…" rather than
  // stalling silently or skipping ahead to an unloaded frame.
  const [buffering, setBuffering] = useState(false);
  const documentId = focus?.id ?? null;

  sliceIndexRef.current = sliceIndex;
  positionsRef.current = positions;
  cineFrameIndexRef.current = cineFrameIndex;
  cineLoopPlayingRef.current = cineLoopPlaying;

  /**
   * The tighter of the two windows this record needs: decoded frames against
   * the frame-cache budget, and retained cine files against theirs. A record
   * is one modality in practice, so normally only one of the two costs is
   * known and the other contributes Infinity.
   */
  function currentLoadRadius(): number {
    return Math.min(
      loadRadius(frameCostRef.current, CACHE_BUDGET_BYTES, PROTECT_RADIUS),
      loadRadius(cineCostRef.current, CINE_SOURCE_BUDGET_BYTES, CINE_PROTECT_RADIUS),
    );
  }

  function isWanted(relativeIndex: number): boolean {
    return Math.abs(relativeIndex - sliceIndexRef.current) <= currentLoadRadius();
  }

  async function loadOne(
    position: number,
    signal: AbortSignal,
  ): Promise<CachedFrame | CineSource> {
    const frameCount = rangeFrameCountRef.current.get(position);
    if (frameCount != null) {
      // Uncompressed multi-frame (plan 07): fetch frame 0 through the range
      // endpoint to learn rows/columns/window, without downloading the rest
      // of a file that can be ~100 MB.
      return loadRangeCineSource(position, frameCount, signal);
    }
    const response = await fetch(fileUrl(fileSource, documentId!, position), {
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
    throw new Error(undrawableFrameMessage(bytes));
  }

  async function fetchFrame(
    position: number,
    frame: number,
    signal?: AbortSignal,
  ): Promise<Response> {
    const response = await fetch(frameUrl(fileSource, documentId!, position, frame), {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      throw new Error("Could not load this frame.");
    }
    return response;
  }

  /** An inclusive batch of frames (plan 12), one range request for up to RANGE_BATCH_SIZE of them. */
  async function fetchFrameRangeBytes(
    position: number,
    from: number,
    to: number,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const response = await fetch(frameRangeUrl(fileSource, documentId!, position, from, to), {
      credentials: "include",
      signal,
    });
    if (!response.ok) {
      throw new Error("Could not load these frames.");
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  async function loadRangeCineSource(
    position: number,
    frameCount: number,
    signal: AbortSignal,
  ): Promise<RangeCineSource> {
    const response = await fetchFrame(position, 0, signal);
    const rows = Number(response.headers.get("X-Frame-Rows"));
    const columns = Number(response.headers.get("X-Frame-Columns"));
    const windowCenter = Number(response.headers.get("X-Window-Center"));
    const windowWidth = Number(response.headers.get("X-Window-Width"));
    const frame0 = new Uint8Array(await response.arrayBuffer());
    // The files-list fetch (plan 12's frameIndex) already knows one frame's
    // byte size without asking the network again; frame0's own length is
    // the fallback for a position that somehow didn't carry one.
    const byteCost = rangeFrameBytesRef.current.get(position) ?? frame0.length;
    return {
      kind: "range-frames",
      rows,
      columns,
      frameCount,
      frameRate: focus?.dicomMeta?.frameRate ?? null,
      windowCenter,
      windowWidth,
      byteCost,
      async frame(index: number, frameSignal?: AbortSignal): Promise<Uint8Array> {
        if (index === 0) {
          return frame0;
        }
        // Every range fetch beyond the frame-0 probe rides the dialog's own
        // AbortController by default, so it's cancelled on close even when
        // the caller doesn't pass one explicitly.
        const r = await fetchFrame(position, index, frameSignal ?? dialogAbortRef.current?.signal);
        return new Uint8Array(await r.arrayBuffer());
      },
      async frameRange(from: number, to: number, frameSignal?: AbortSignal): Promise<Uint8Array> {
        if (from === 0 && to === 0) {
          return frame0;
        }
        return fetchFrameRangeBytes(
          position,
          from,
          to,
          frameSignal ?? dialogAbortRef.current?.signal,
        );
      },
    };
  }

  /** The positions within `radius` of the current one, clipped to the list. */
  function positionsAroundCurrentSlice(radius: number): number[] {
    const list = positionsRef.current;
    const around = sliceIndexRef.current;
    const nearby: number[] = [];
    for (
      let relative = Math.max(0, around - radius);
      relative <= Math.min(list.length - 1, around + radius);
      relative += 1
    ) {
      nearby.push(list[relative]);
    }
    return nearby;
  }

  function protectAroundCurrentSlice() {
    cacheRef.current.protect(positionsAroundCurrentSlice(PROTECT_RADIUS));
    // The open loop has to outlive its own decode pump, which reads its
    // source again for every frame it decodes.
    cineSourcesRef.current.protect(positionsAroundCurrentSlice(CINE_PROTECT_RADIUS));
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
        if (entry.kind === "jpeg-frames" || entry.kind === "range-frames") {
          cineCostRef.current = Math.max(cineCostRef.current ?? 0, entry.byteCost);
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

  /**
   * Drops the open loop's decoded bitmaps (closing each) and its raw
   * angiography frame bytes, and stops any decode/preload in flight —
   * called on every position change and on dialog close, so neither cache
   * ever holds more than one run's worth of frames.
   */
  function resetCineBitmaps() {
    cineDecodeTokenRef.current += 1;
    cineBitmapsRef.current?.clear();
    cineBitmapsRef.current = null;
    rangeRawFramesRef.current.clear();
    rangePreloadStartedForRef.current = null;
    rangePreloadedRef.current = 0;
    setRangePreloaded(0);
    residentPrefixRef.current = 0;
    permanentlyMissingRef.current = new Set();
  }

  /** The decoded-frame LRU for this loop: CINE_RESIDENT_FRAMES frames of its own size. */
  function cineBitmapsFor(source: CineSource): FrameCache<CachedCineFrame> {
    const existing = cineBitmapsRef.current;
    if (existing) {
      return existing;
    }
    const created = new FrameCache<CachedCineFrame>(
      Math.max(1, source.rows * source.columns * 4) * CINE_RESIDENT_FRAMES,
      { dispose: (entry) => (entry.kind === "bitmap" ? entry.bitmap.close() : undefined) },
    );
    cineBitmapsRef.current = created;
    return created;
  }

  /**
   * Decodes what playback is about to draw, one frame at a time, until the
   * window around the current frame is resident. One pump runs per loop, and
   * it re-reads the current frame on every turn — so scrubbing or pressing
   * play mid-decode just changes what it decodes next. For an angiography
   * run (plan 07) this is the on-demand fallback for a frame the bulk
   * preload below hasn't reached yet or already evicted.
   */
  function pumpCineDecode(source: CineSource) {
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
        const entry = await decodeCineFrame(source, next);
        if (cancelledRef.current || token !== cineDecodeTokenRef.current) {
          if (entry.kind === "bitmap") {
            entry.bitmap.close();
          }
          return;
        }
        // Pin the frame on screen, so prefetching ahead can never evict it.
        cache.protect([cineFrameIndexRef.current]);
        cache.set(next, entry);
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

  /**
   * One frame of either cine kind, decoded/fetched and ready to cache. For
   * an angiography run (plan 07), the raw bytes normally already sit in
   * rangeRawFramesRef — the bulk preload below fetches the whole run before
   * Play is even enabled — so this only hits the network itself for a
   * frame the raw cache dropped (a run bigger than its 160 MB budget) or
   * one played before the preload reached it.
   */
  async function decodeCineFrame(source: CineSource, index: number): Promise<CachedCineFrame> {
    if (source.kind === "jpeg-frames") {
      const bitmap = await createImageBitmap(
        new Blob([source.frame(index)], { type: "image/jpeg" }),
      );
      return { kind: "bitmap", rows: source.rows, columns: source.columns, bitmap };
    }
    const raw = rangeRawFramesRef.current.get(index);
    const pixels = raw ? raw.bytes : await source.frame(index, dialogAbortRef.current?.signal);
    const frame: DicomMono8Frame = {
      kind: "mono8",
      rows: source.rows,
      columns: source.columns,
      pixels,
      windowCenter: source.windowCenter,
      windowWidth: source.windowWidth,
    };
    return {
      kind: "raster",
      rows: source.rows,
      columns: source.columns,
      rgba: renderFrameRgba(frame, []),
    };
  }

  /**
   * Fills rangeRawFramesRef with every frame of an angiography run (plan 07
   * section D, batched per plan 12) — not just a resident window — via
   * RANGE_PRELOAD_CONCURRENCY parallel batch range requests of up to
   * RANGE_BATCH_SIZE frames each, using the pure scheduler in
   * client/src/lib/range-preload.ts (one scheduler "item" is now a batch,
   * not a frame — cuts the reference 108-frame run from 108 HTTP round
   * trips to 14). Runs once per loop (guarded by rangePreloadStartedForRef,
   * below) and drives the "Loading n / N" bar. Play unlocks well before
   * this finishes — see canPlay — but the preload itself always keeps
   * going for the whole run in the background. pumpCineDecode's on-demand
   * path is still what rasterizes a frame for drawing (from this raw cache
   * once it's landed), and is still the fallback for a frame this preload
   * hasn't reached yet.
   */
  function pumpRangePreload(source: RangeCineSource) {
    const token = cineDecodeTokenRef.current;
    const raw = rangeRawFramesRef.current;
    const frameBytes = source.byteCost;
    const batches = frameBatches(source.frameCount, RANGE_BATCH_SIZE);
    rangePreloadedRef.current = 0;
    setRangePreloaded(0);
    setRangeMissing(0);

    /** Advances the contiguous-from-zero pointer past whatever is now settled (landed or given up on), and publishes it. */
    function advanceResidentPrefix() {
      let position = residentPrefixRef.current;
      while (raw.has(position) || permanentlyMissingRef.current.has(position)) {
        position += 1;
      }
      residentPrefixRef.current = position;
      rangePreloadedRef.current = position;
      setRangePreloaded(position);
    }

    preloadFrames(
      batches.length,
      RANGE_PRELOAD_CONCURRENCY,
      async (batchIndex) => {
        const { from, to } = batches[batchIndex];
        if (raw.has(from) && raw.has(to)) {
          // Already resident end to end (e.g. the frame-0 probe already
          // covered a batch of size 1) — nothing to fetch.
          return;
        }
        const bytes = await source.frameRange(from, to, dialogAbortRef.current?.signal);
        if (cancelledRef.current || token !== cineDecodeTokenRef.current) {
          return;
        }
        for (let index = from; index <= to; index += 1) {
          if (raw.has(index)) {
            continue;
          }
          raw.set(
            index,
            rawFrameFromBatch(bytes, index - from, frameBytes, source.rows, source.columns),
          );
        }
      },
      () => {
        if (cancelledRef.current || token !== cineDecodeTokenRef.current) {
          return;
        }
        advanceResidentPrefix();
        // The frame on screen may be one this tick just landed — let the
        // draw effect re-check.
        setCineDecoded((count) => count + 1);
      },
      () => cancelledRef.current || token !== cineDecodeTokenRef.current,
      {
        onFrameFailed: (batchIndex) => {
          if (cancelledRef.current || token !== cineDecodeTokenRef.current) {
            return;
          }
          const { from, to } = batches[batchIndex];
          for (let index = from; index <= to; index += 1) {
            permanentlyMissingRef.current.add(index);
          }
          setRangeMissing((count) => count + (to - from + 1));
          advanceResidentPrefix();
        },
      },
    ).catch(() => {
      if (!cancelledRef.current && token === cineDecodeTokenRef.current) {
        setError("Could not preload this angiography run.");
      }
    });
  }

  useEffect(() => {
    const controller = new AbortController();
    // The dialog's own AbortController — every angiography-run range fetch
    // (bulk preload and on-demand fallback alike) rides this one, so
    // closing the dialog or switching documents actually cancels those
    // outstanding HTTP requests. See dialogAbortRef's own comment.
    dialogAbortRef.current = controller;
    cacheRef.current.clear();
    frameCostRef.current = null;
    drawnRef.current = null;
    inflightRef.current = new Set();
    loadedPositionsRef.current = new Set();
    cineSourcesRef.current.clear();
    cineCostRef.current = null;
    resetCineBitmaps();
    cineResetPositionRef.current = null;
    rangeFrameCountRef.current = new Map();
    rangeFrameBytesRef.current = new Map();
    activeWorkersRef.current = 0;
    cancelledRef.current = false;
    setPositions([]);
    setPhases(null);
    setKind(null);
    setViewLabels(new Map());
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
      const response = await fetch(filesListUrl(fileSource, documentId), {
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
      for (const file of files) {
        if (file.frameIndex != null && file.frameIndex.numberOfFrames > 1) {
          rangeFrameCountRef.current.set(file.position, file.frameIndex.numberOfFrames);
          rangeFrameBytesRef.current.set(file.position, file.frameIndex.frameBytes);
        }
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
      const initialPositions = detection ? detection.phases[0].positions : allPositions;
      setPhases(detection?.phases ?? null);
      setPositions(initialPositions);
      if (initialPosition != null) {
        const startIndex = initialPositions.indexOf(initialPosition);
        if (startIndex >= 0) {
          setSliceIndex(startIndex);
        }
      }

      // Plan 13: "views" (echo) and "runs" (angiography) get a thumbnail
      // strip instead of the position slider — see the render below. Labels
      // are keyed by position, computed once from the files list. `kind`
      // only gates that choice here, but still needs `detection` (just
      // computed above) to ever read "phases" rather than "volume" — a CT
      // record with a detected cardiac cycle isn't a views/runs strip
      // either way, but a null-vs-non-null `kind` elsewhere (e.g. a future
      // caller keying off it) should still see this record's real kind.
      const seriesMeta = focus?.dicomMeta ?? null;
      const recordKind = seriesMeta ? seriesKind(seriesMeta, files.length, detection != null) : null;
      setKind(recordKind);
      if (recordKind === "views") {
        const labels = new Map<number, string>();
        for (const file of files) {
          labels.set(
            file.position,
            viewLabel({
              imageType: file.imageType ?? [],
              usRegionDataTypes: file.usRegionDataTypes ?? [],
              numberOfFrames: file.numberOfFrames ?? 1,
              frameRate: file.frameRate,
            }),
          );
        }
        setViewLabels(labels);
      } else if (recordKind === "runs") {
        const labels = new Map<number, string>();
        files.forEach((file, index) => {
          labels.set(
            file.position,
            runLabel(
              {
                positionerPrimaryAngle: file.positionerPrimaryAngle,
                positionerSecondaryAngle: file.positionerSecondaryAngle,
                numberOfFrames: file.frameIndex?.numberOfFrames ?? file.numberOfFrames ?? 1,
              },
              index + 1,
            ),
          );
        });
        setViewLabels(labels);
      }

      kickLoaders(controller.signal);
    })().catch((caught: unknown) => {
      if (!cancelledRef.current) {
        setError(caught instanceof Error ? caught.message : "Could not load series");
      }
    });

    return () => {
      cancelledRef.current = true;
      controller.abort();
      dialogAbortRef.current = null;
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
    // Angiography run (plan 07 section D): start the whole-run bulk
    // parallel preload once per loop, before falling through to the same
    // on-demand pump used for ultrasound — the fallback for a frame the
    // preload hasn't reached yet, or one its raw cache has since evicted.
    if (source.kind === "range-frames" && rangePreloadStartedForRef.current !== source) {
      rangePreloadStartedForRef.current = source;
      pumpRangePreload(source);
    }
    pumpCineDecode(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sliceIndex, positions, loaded, cineFrameIndex, cineLoopPlaying, cineDecoded]);

  // Advances the current frame by elapsed time x the loop's own frame rate,
  // looping. Playback runs on wall-clock time whether or not a frame's
  // bitmap is resident yet; the decode pump above chases it. For an
  // angiography run (plan 12), canPlay also gates each tick: if playback
  // has caught up with the preload, it holds on the last resident frame
  // ("buffering…") instead of advancing past what's actually loaded — the
  // clock is pinned at the elapsed time of that last safe frame so
  // playback resumes smoothly, rather than jumping ahead, once the preload
  // (which keeps running the whole time) builds its lead back up.
  useEffect(() => {
    if (!cineLoopPlaying) {
      setBuffering(false);
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
    const isRangeSource = source.kind === "range-frames";
    let start = performance.now();
    let lastSafeElapsed = 0;
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - start;
      const desired = cineFrameAtElapsed(elapsed, frameRate, frameCount);
      const resident = isRangeSource ? rangePreloadedRef.current : frameCount;
      if (canPlay(resident, desired, frameCount)) {
        lastSafeElapsed = elapsed;
        setBuffering(false);
        setCineFrameIndex(desired);
      } else {
        // Hold: pin the clock at the last elapsed time that was safe to
        // show, so the next tick re-derives the same frame instead of
        // drifting forward while nothing new has landed.
        start = now - lastSafeElapsed;
        setBuffering(true);
      }
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
    if (entry.kind === "bitmap") {
      blitBitmap(canvas, entry.bitmap);
    } else {
      blitRaster(canvas, entry.rows, entry.columns, entry.rgba);
    }
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
  // Plan 13: "views" (echo) and "runs" (angiography) navigate with a
  // thumbnail strip instead of the position slider.
  const isViewStrip = kind === "views" || kind === "runs";
  // For an angiography run (plan 07 section D), the whole run keeps
  // preloading in the background (rangeRawFramesRef) — but Play unlocks
  // progressively (plan 12), once canPlay says the first stretch of frames
  // is resident, not only once the whole run has landed.
  const rangePreloadTotal = currentCine?.kind === "range-frames" ? currentCine.frameCount : 0;
  // An ultrasound cine (plan 06) has its whole file downloaded before it
  // ever becomes `currentCine` — no progressive residency to track, so it
  // reads as fully resident from the start.
  const cineResident =
    currentCine == null ? 0 : currentCine.kind === "range-frames" ? rangePreloaded : currentCine.frameCount;
  const isCinePlayable =
    !!currentCine &&
    currentCine.frameRate != null &&
    currentCine.frameCount > 1 &&
    canPlay(cineResident, 0, currentCine.frameCount);
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
                : isViewStrip
                  ? `Click a thumbnail, or use the arrow keys, to switch ${kind === "views" ? "views" : "runs"}.`
                  : "Stay in this dialog. Use the slider, the mouse wheel, or the arrow keys to move through slices. Space bar cines through phases."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <div data-testid="dicom-viewer-error">
            <p className="text-sm text-destructive">{error.split("\n")[0]}</p>
            {error.includes("\n") && (
              <p className="text-xs text-foreground-subtle mt-1">
                {error.split("\n").slice(1).join("\n")}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 min-w-0">
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
                    {buffering && (
                      <span
                        className="ml-2 text-foreground-subtle"
                        data-testid="dicom-buffering"
                      >
                        · buffering…
                      </span>
                    )}
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
                {currentCine.kind === "range-frames" && rangePreloadTotal > rangePreloaded && (
                  <div className="space-y-1">
                    <p className="text-xs text-foreground-subtle" data-testid="dicom-range-preload">
                      Loading {rangePreloaded} / {rangePreloadTotal}
                    </p>
                    <div className="h-1 w-full rounded bg-surface-1" aria-hidden="true">
                      <div
                        className="h-1 rounded bg-primary transition-[width]"
                        style={{ width: `${loadProgressPercent(rangePreloaded, rangePreloadTotal)}%` }}
                      />
                    </div>
                  </div>
                )}
                {currentCine.kind === "range-frames" && rangeMissing > 0 && (
                  <p className="text-xs text-foreground-subtle" data-testid="dicom-range-missing">
                    {rangeMissing} of {rangePreloadTotal} frames could not be preloaded; they load when shown.
                  </p>
                )}
              </div>
            )}
            <div className="flex items-center justify-between gap-4">
              {isViewStrip ? (
                <label className="text-sm text-foreground-muted">
                  {kind === "views" ? "View" : "Run"}{" "}
                  <span data-testid="dicom-slice-index">{sliceLabel}</span>
                  {loading && (
                    <span className="ml-2 text-foreground-subtle" data-testid="dicom-loaded-count">
                      · loaded {loadedInPhase} / {count}
                    </span>
                  )}
                </label>
              ) : (
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
              )}
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
            {isViewStrip ? (
              // Plan 13: one thumbnail per view/run, frame 0, current one
              // highlighted — replaces the position slider for these kinds.
              // ←/→ still move between them (the onKeyDown handler above
              // treats positions the same way regardless of kind).
              <div
                className="flex gap-2 overflow-x-auto pb-1 min-w-0 w-full"
                data-testid="dicom-view-strip"
              >
                {positions.map((position, index) =>
                  isViewStripThumbLoaded(index, sliceIndex) ? (
                    <ViewStripThumb
                      key={position}
                      documentId={documentId!}
                      position={position}
                      dicomMeta={focus?.dicomMeta ?? null}
                      label={viewLabels.get(position) ?? ""}
                      selected={index === sliceIndex}
                      onSelect={() => setSliceIndex(index)}
                      testId={`dicom-view-${index}`}
                    />
                  ) : (
                    // Outside the load window (see isViewStripThumbLoaded)
                    // — still selectable, so ←/→ or a click keeps reaching
                    // every view, but doesn't fire its thumbnail fetch
                    // until it's actually near the current selection.
                    <button
                      key={position}
                      type="button"
                      onClick={() => setSliceIndex(index)}
                      data-testid={`dicom-view-${index}`}
                      className="flex-shrink-0 w-24 text-left rounded-md border-2 border-transparent"
                    >
                      <div className="w-24 h-24 rounded bg-black/40 flex items-center justify-center">
                        <ScanLine className="h-5 w-5 text-white/30" />
                      </div>
                      <p className="mt-1 text-xs text-foreground-subtle font-body truncate px-0.5">
                        {viewLabels.get(position) ?? ""}
                      </p>
                    </button>
                  ),
                )}
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
