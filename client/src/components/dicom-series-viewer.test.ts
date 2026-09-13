import { describe, it, expect } from "vitest";
import { countLoaded, loadProgressPercent } from "./dicom-series-viewer";
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
