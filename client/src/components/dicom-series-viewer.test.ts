import { describe, it, expect } from "vitest";
import {
  cineFrameAtElapsed,
  cineFramesToDecode,
  countLoaded,
  loadProgressPercent,
} from "./dicom-series-viewer";
import { FrameCache } from "@/lib/frame-cache";

describe("countLoaded", () => {
  it("counts every position ever loaded, not just those still resident in a bounded cache", () => {
    // Mirrors a phase larger than the cache budget (docs/plans/04-multiphase-and-cache.md):
    // a cache that can only hold 3 of these frames at once.
    const frame = { rows: 2, columns: 2, kind: "mono16" }; // cost: 2*2*2 = 8 bytes
    const cache = new FrameCache<typeof frame>(3 * 8);
    const positions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const loadedPositions = new Set<number>();

    for (const position of positions) {
      cache.set(position, frame);
      loadedPositions.add(position);
    }

    // The bounded cache evicted most of the earlier frames as later ones
    // loaded, so residency alone never reaches the full count...
    const residentCount = positions.filter((position) => cache.has(position)).length;
    expect(residentCount).toBeLessThan(positions.length);

    // ...but every position was loaded at some point, so the "loaded X / Y"
    // count must reflect that instead of cache residency.
    expect(countLoaded(positions, loadedPositions)).toBe(positions.length);
  });

  it("only counts positions belonging to the given list", () => {
    const loadedPositions = new Set([5, 6, 7]);
    expect(countLoaded([1, 2, 3], loadedPositions)).toBe(0);
    expect(countLoaded([1, 6, 3], loadedPositions)).toBe(1);
  });
});

describe("loadProgressPercent", () => {
  it("computes the normal percentage", () => {
    expect(loadProgressPercent(5, 10)).toBe(50);
  });

  it("caps at 100%", () => {
    // Guards against a stray over-count (e.g. a stale ref from a previous
    // phase) ever pushing the progress bar past full width.
    expect(loadProgressPercent(12, 10)).toBe(100);
  });

  it("returns 0 when there are no positions", () => {
    expect(loadProgressPercent(0, 0)).toBe(0);
  });
});

describe("cineFrameAtElapsed", () => {
  it("stays on frame 0 with no elapsed time", () => {
    expect(cineFrameAtElapsed(0, 30, 96)).toBe(0);
  });

  it("advances by elapsed time x frame rate", () => {
    // 500ms at 30fps = 15 frames in.
    expect(cineFrameAtElapsed(500, 30, 96)).toBe(15);
  });

  it("loops back to the start past the last frame", () => {
    // 96 frames at 30fps is 3200ms/loop; 3300ms is 100ms (3 frames) into loop 2.
    expect(cineFrameAtElapsed(3300, 30, 96)).toBe(3);
  });

  it("is always 0 for a single-frame source", () => {
    expect(cineFrameAtElapsed(5000, 30, 1)).toBe(0);
  });
});

describe("cineFramesToDecode", () => {
  const none = () => false;
  const all = () => true;

  it("asks for the frame on screen when its bitmap is not resident", () => {
    expect(cineFramesToDecode(7, 96, 0, none)).toEqual([7]);
  });

  it("asks for nothing when the frame on screen is already decoded", () => {
    expect(cineFramesToDecode(7, 96, 0, all)).toEqual([]);
  });

  it("prefetches the frames just ahead, current one first", () => {
    expect(cineFramesToDecode(7, 96, 3, none)).toEqual([7, 8, 9, 10]);
  });

  it("wraps the prefetch window around the end of the loop", () => {
    // Playback loops, so the frames after the last one are the first ones.
    expect(cineFramesToDecode(94, 96, 3, none)).toEqual([94, 95, 0, 1]);
  });

  it("skips frames already decoded and keeps the rest in order", () => {
    const resident = new Set([8, 10]);
    expect(cineFramesToDecode(7, 96, 3, (index) => resident.has(index))).toEqual([7, 9]);
  });

  it("never asks for the same frame twice in a loop shorter than the window", () => {
    expect(cineFramesToDecode(1, 3, 8, none)).toEqual([1, 2, 0]);
  });

  it("asks for nothing when there are no frames", () => {
    expect(cineFramesToDecode(0, 0, 4, none)).toEqual([]);
  });

  it("normalises a current index outside the loop", () => {
    expect(cineFramesToDecode(5, 4, 0, none)).toEqual([1]);
  });
});
