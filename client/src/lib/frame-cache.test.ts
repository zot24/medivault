import { describe, expect, it } from "vitest";
import { FrameCache, type CacheableFrame } from "./frame-cache";

// 8x8 mono16 = 128 bytes/frame.
const ROWS = 8;
const COLUMNS = 8;
const FRAME_COST = ROWS * COLUMNS * 2;

function frame(id: number): CacheableFrame & { id: number } {
  return { id, rows: ROWS, columns: COLUMNS, kind: "mono16" };
}

describe("FrameCache", () => {
  it("evicts the oldest untouched frame once the budget is exceeded", () => {
    const cache = new FrameCache<ReturnType<typeof frame>>(3 * FRAME_COST);
    cache.set(0, frame(0));
    cache.set(1, frame(1));
    cache.set(2, frame(2));
    cache.set(3, frame(3));

    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
  });

  it("counts get() as a touch, so a re-read frame survives instead of the next-oldest one", () => {
    const cache = new FrameCache<ReturnType<typeof frame>>(3 * FRAME_COST);
    cache.set(0, frame(0));
    cache.set(1, frame(1));
    cache.set(2, frame(2));
    cache.get(0); // 0 is now the most-recently-used; 1 becomes the oldest
    cache.set(3, frame(3));

    expect(cache.has(1)).toBe(false);
    expect(cache.has(0)).toBe(true);
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
  });

  it("never evicts a protected position, even when it is the oldest", () => {
    const cache = new FrameCache<ReturnType<typeof frame>>(3 * FRAME_COST);
    cache.set(0, frame(0));
    cache.set(1, frame(1));
    cache.set(2, frame(2));
    cache.protect([0]); // pin the current index

    cache.set(3, frame(3));

    expect(cache.has(0)).toBe(true); // protected, survives despite being oldest
    expect(cache.has(1)).toBe(false); // next-oldest, evicted instead
    expect(cache.has(2)).toBe(true);
    expect(cache.has(3)).toBe(true);
  });

  it("weighs an rgb8 frame 1.5x a mono16 frame of the same dimensions", () => {
    const cache = new FrameCache<CacheableFrame>(FRAME_COST * 1.5);
    cache.set(0, { rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.set(1, { rows: ROWS, columns: COLUMNS, kind: "rgb8" }); // 192 bytes, pushes past 192-byte budget together with 128

    // budget is 192 bytes; mono16 (128) + rgb8 (192) = 320 > 192, so the
    // mono16 frame (older, unprotected) must be evicted.
    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
  });

  it("clear() empties the cache and its protection", () => {
    const cache = new FrameCache<ReturnType<typeof frame>>(3 * FRAME_COST);
    cache.set(0, frame(0));
    cache.protect([0]);
    cache.clear();

    expect(cache.has(0)).toBe(false);
    // After clear, nothing is protected: a fresh insert that would exceed
    // budget can evict position 0's old slot cleanly (it's simply gone).
    cache.set(1, frame(1));
    cache.set(2, frame(2));
    cache.set(3, frame(3));
    cache.set(4, frame(4));
    expect(cache.has(1)).toBe(false);
  });

  it("weighs a bitmap frame (plan 06 cine playback) as rows*columns*4", () => {
    // 8x8 bitmap = 256 bytes; budget fits exactly one.
    const cache = new FrameCache<CacheableFrame>(ROWS * COLUMNS * 4);
    cache.set(0, { rows: ROWS, columns: COLUMNS, kind: "bitmap" });
    cache.set(1, { rows: ROWS, columns: COLUMNS, kind: "bitmap" });

    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
  });

  it("calls dispose on an evicted frame, so a decoded ImageBitmap can be closed", () => {
    const closed: number[] = [];
    type Bitmapish = CacheableFrame & { id: number; close(): void };
    const cache = new FrameCache<Bitmapish>(3 * FRAME_COST, {
      dispose: (entry) => {
        closed.push(entry.id);
        entry.close();
      },
    });
    const bitmap = (id: number): Bitmapish => ({
      id,
      rows: ROWS,
      columns: COLUMNS,
      kind: "mono16",
      close: () => {},
    });
    cache.set(0, bitmap(0));
    cache.set(1, bitmap(1));
    cache.set(2, bitmap(2));
    cache.set(3, bitmap(3)); // evicts 0

    expect(closed).toEqual([0]);
  });

  it("disposes a replaced entry when the same position is set again", () => {
    const closed: number[] = [];
    const cache = new FrameCache<CacheableFrame & { id: number }>(3 * FRAME_COST, {
      dispose: (entry) => closed.push(entry.id),
    });
    cache.set(0, { id: 1, rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.set(0, { id: 2, rows: ROWS, columns: COLUMNS, kind: "mono16" });

    expect(closed).toEqual([1]);
  });

  it("disposes every remaining entry on clear()", () => {
    const closed: number[] = [];
    const cache = new FrameCache<CacheableFrame & { id: number }>(3 * FRAME_COST, {
      dispose: (entry) => closed.push(entry.id),
    });
    cache.set(0, { id: 1, rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.set(1, { id: 2, rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.clear();

    expect(closed.sort()).toEqual([1, 2]);
  });

  it("replacing an existing position updates its cost without double-counting", () => {
    // Budget fits exactly two frames (256 bytes). Re-setting position 0
    // must not count its cost twice, or the budget would look exceeded
    // after only two distinct positions are stored.
    const cache = new FrameCache<CacheableFrame>(2 * FRAME_COST);
    cache.set(0, { rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.set(0, { rows: ROWS, columns: COLUMNS, kind: "mono16" });
    cache.set(1, { rows: ROWS, columns: COLUMNS, kind: "mono16" });
    expect(cache.has(0)).toBe(true);
    expect(cache.has(1)).toBe(true);

    // A third distinct frame now exceeds the budget; 0 is the
    // least-recently-touched (re-setting it happened before 1 was added)
    // and unprotected, so it is the one evicted.
    cache.set(2, { rows: ROWS, columns: COLUMNS, kind: "mono16" });
    expect(cache.has(0)).toBe(false);
    expect(cache.has(1)).toBe(true);
    expect(cache.has(2)).toBe(true);
  });
});
