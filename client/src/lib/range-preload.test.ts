import { describe, expect, it } from "vitest";
import { preloadFrames } from "./range-preload";

/** A promise the test controls the resolution of, plus the function to resolve it. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Lets already-queued microtasks (like the synchronous part of each worker's loop) run. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

describe("preloadFrames", () => {
  it("claims every frame exactly once, in ascending order, regardless of completion order", async () => {
    const claimOrder: number[] = [];
    // Frame 0 resolves last, frame 9 resolves first — order of completion
    // is scrambled, but the claim order (what fetchFrame is called with)
    // must still be 0..9: a free worker always takes the lowest unclaimed
    // index.
    await preloadFrames(
      10,
      4,
      async (index) => {
        claimOrder.push(index);
        await new Promise((resolve) => setTimeout(resolve, (10 - index) % 3));
      },
      () => {},
    );

    expect(claimOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("never runs more than `concurrency` fetches at once", async () => {
    const pending: Array<() => void> = [];
    let concurrent = 0;
    let maxConcurrent = 0;

    const run = preloadFrames(
      10,
      4,
      async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        const { promise, resolve } = deferred<void>();
        pending.push(() => {
          concurrent -= 1;
          resolve();
        });
        await promise;
      },
      () => {},
    );

    // Let the first wave of workers reach their fetch and block there.
    await flushMicrotasks();
    expect(pending.length).toBe(4);
    expect(maxConcurrent).toBe(4);

    // Release them one at a time; concurrency must never exceed 4 even as
    // freed workers immediately claim the next index.
    while (pending.length > 0) {
      pending.shift()!();
      await flushMicrotasks();
      expect(concurrent).toBeLessThanOrEqual(4);
    }

    await run;
    expect(maxConcurrent).toBe(4);
  });

  it("uses at most `frameCount` workers when concurrency exceeds it", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    await preloadFrames(
      2,
      4,
      async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await Promise.resolve();
        concurrent -= 1;
      },
      () => {},
    );
    expect(maxConcurrent).toBe(2);
  });

  it("reports cumulative progress 1..N in order, once per completed frame", async () => {
    const progress: number[] = [];
    const outcome = await preloadFrames(
      6,
      3,
      async (index) => {
        await new Promise((resolve) => setTimeout(resolve, (6 - index) % 3));
      },
      (done) => progress.push(done),
    );

    expect(outcome).toBe("done");
    expect(progress).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("stops claiming new frames once isAborted turns true, and reports \"aborted\"", async () => {
    let claimed = 0;
    let aborted = false;
    const outcome = await preloadFrames(
      10,
      2,
      async () => {
        claimed += 1;
        if (claimed === 3) {
          aborted = true;
        }
      },
      () => {},
      () => aborted,
    );

    expect(outcome).toBe("aborted");
    // Some fetches already in flight when the flag flipped may still land,
    // but the scheduler must not claim the whole remaining run.
    expect(claimed).toBeLessThan(10);
  });

  it("resolves immediately with \"done\" for a zero-frame run", async () => {
    let calls = 0;
    const outcome = await preloadFrames(
      0,
      4,
      async () => {
        calls += 1;
      },
      () => {},
    );
    expect(outcome).toBe("done");
    expect(calls).toBe(0);
  });
});
