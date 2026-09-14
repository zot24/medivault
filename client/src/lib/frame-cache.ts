/**
 * A bounded, least-recently-used cache of decoded DICOM frames. Replaces an
 * unbounded `Map<number, DicomFrame>` so a 5,800-slice series doesn't grow
 * the JS heap to ~3 GB (see docs/plans/04-multiphase-and-cache.md).
 *
 * A frame's cost in bytes is its decoded pixel buffer size: mono16 is 2
 * bytes/pixel, rgb8 is 3, and a decoded `bitmap` (an ultrasound cine frame,
 * plan 06 — `createImageBitmap`'s RGBA output) is 4. An entry that pins
 * something other than a pixel buffer states its own `byteCost` instead.
 * Eviction removes the
 * least recently *drawn or loaded* frame first (`get` counts as a touch, so
 * does `set`), but never a position passed to `protect` — the caller uses
 * that to pin the current slice and its neighbours so scrolling never
 * evicts what's on screen. Pass `dispose` to release a resource (e.g.
 * `bitmap.close()`) an entry holds once it leaves the cache.
 */
export type CacheableFrame = {
  rows: number;
  columns: number;
  kind: string;
  /**
   * What this entry really pins, when that isn't a rows x columns pixel
   * buffer. An encapsulated JPEG cine source (plan 06) holds the whole file
   * it was parsed from so it can decode frames on demand — ~9.6 MB for a
   * 96-frame echo loop, against the ~2 MB its dimensions suggest.
   */
  byteCost?: number;
};

function costOf(frame: CacheableFrame): number {
  if (frame.byteCost != null && frame.byteCost > 0) {
    return frame.byteCost;
  }
  const bytesPerPixel = frame.kind === "mono16" ? 2 : frame.kind === "bitmap" ? 4 : 3;
  return frame.rows * frame.columns * bytesPerPixel;
}

export type FrameCacheOptions<T> = {
  /**
   * Called once for every entry removed from the cache — evicted to stay
   * within budget, replaced by a `set()` of the same position, or cleared —
   * before it is otherwise discarded. Used to `bitmap.close()` a decoded
   * ImageBitmap (plan 06: ultrasound cine playback) so the bounded cache
   * doesn't leak GPU-backed memory the JS heap can't see.
   */
  dispose?: (frame: T) => void;
};

export class FrameCache<T extends CacheableFrame> {
  private readonly maxBytes: number;
  private readonly dispose?: (frame: T) => void;
  // Map iteration order is insertion order; re-inserting on every touch
  // keeps it least-recently-used -> most-recently-used, front to back.
  private readonly entries = new Map<number, T>();
  private protectedPositions = new Set<number>();
  private bytesUsed = 0;

  constructor(maxBytes: number, options: FrameCacheOptions<T> = {}) {
    this.maxBytes = maxBytes;
    this.dispose = options.dispose;
  }

  has(position: number): boolean {
    return this.entries.has(position);
  }

  get(position: number): T | undefined {
    const entry = this.entries.get(position);
    if (entry === undefined) {
      return undefined;
    }
    this.entries.delete(position);
    this.entries.set(position, entry);
    return entry;
  }

  set(position: number, frame: T): void {
    const existing = this.entries.get(position);
    if (existing !== undefined) {
      this.bytesUsed -= costOf(existing);
      this.entries.delete(position);
      if (existing !== frame) {
        this.dispose?.(existing);
      }
    }
    this.entries.set(position, frame);
    this.bytesUsed += costOf(frame);
    this.evictUntilWithinBudget();
  }

  /**
   * Marks these positions as never-evict, replacing any earlier protection.
   * Call this whenever the current slice (or phase) changes, passing the
   * current position and its neighbours.
   */
  protect(positions: Iterable<number>): void {
    this.protectedPositions = new Set(positions);
  }

  clear(): void {
    if (this.dispose) {
      for (const frame of Array.from(this.entries.values())) {
        this.dispose(frame);
      }
    }
    this.entries.clear();
    this.protectedPositions.clear();
    this.bytesUsed = 0;
  }

  private evictUntilWithinBudget(): void {
    if (this.bytesUsed <= this.maxBytes) {
      return;
    }
    for (const [position, frame] of Array.from(this.entries)) {
      if (this.bytesUsed <= this.maxBytes) {
        return;
      }
      if (this.protectedPositions.has(position)) {
        continue;
      }
      this.entries.delete(position);
      this.bytesUsed -= costOf(frame);
      this.dispose?.(frame);
    }
  }
}
