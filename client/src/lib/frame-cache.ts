/**
 * A bounded, least-recently-used cache of decoded DICOM frames. Replaces an
 * unbounded `Map<number, DicomFrame>` so a 5,800-slice series doesn't grow
 * the JS heap to ~3 GB (see docs/plans/04-multiphase-and-cache.md).
 *
 * A frame's cost in bytes is its decoded pixel buffer size: mono16 is 2
 * bytes/pixel, rgb8 is 3. Eviction removes the least recently *drawn or
 * loaded* frame first (`get` counts as a touch, so does `set`), but never a
 * position passed to `protect` — the caller uses that to pin the current
 * slice and its neighbours so scrolling never evicts what's on screen.
 */
export type CacheableFrame = {
  rows: number;
  columns: number;
  kind: string;
};

function costOf(frame: CacheableFrame): number {
  return frame.rows * frame.columns * (frame.kind === "mono16" ? 2 : 3);
}

export class FrameCache<T extends CacheableFrame> {
  private readonly maxBytes: number;
  // Map iteration order is insertion order; re-inserting on every touch
  // keeps it least-recently-used -> most-recently-used, front to back.
  private readonly entries = new Map<number, T>();
  private protectedPositions = new Set<number>();
  private bytesUsed = 0;

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes;
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
    }
  }
}
