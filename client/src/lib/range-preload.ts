/**
 * The pure scheduling logic behind the angiography-run whole-file preload
 * (plan 07 section D): claim frames in ascending order, run up to
 * `concurrency` fetches at once, and report cumulative progress as each one
 * lands. Kept dependency-light (no DOM, no fetch, no cache) so it can be
 * unit tested without a real network or a real FrameCache — see
 * range-preload.test.ts. client/src/components/dicom-series-viewer.tsx
 * supplies the real `fetchFrame` (an HTTP range request) and `onProgress`
 * (state that drives the "Loading n / N" bar and gates the Play button).
 */

export type FrameBatch = {
  /** First frame of the batch, inclusive. */
  from: number;
  /** Last frame of the batch, inclusive. */
  to: number;
};

/**
 * Splits `[0, frameCount)` into consecutive inclusive ranges of up to
 * `batchSize` frames each (plan 12 section 2) — what the whole-run preload
 * fetches one range request per batch, instead of one per frame, matching
 * the server's `.../frames/:from-:to` route (server/document-files.ts's
 * MAX_FRAME_RANGE). The last batch is whatever is left over, so it may be
 * smaller than `batchSize`.
 */
export function frameBatches(frameCount: number, batchSize: number): FrameBatch[] {
  const batches: FrameBatch[] = [];
  for (let from = 0; from < frameCount; from += batchSize) {
    batches.push({ from, to: Math.min(from + batchSize, frameCount) - 1 });
  }
  return batches;
}

export type PreloadOutcome = "done" | "aborted";

export type PreloadOptions = {
  /** Attempts per frame before it is given up on (default 3). */
  attempts?: number;
  /** Pause between attempts, doubling each time (default 250 ms). */
  retryDelayMs?: number;
  /** Called once for each frame that failed every attempt; the run continues. */
  onFrameFailed?: (index: number) => void;
};

/**
 * Runs `fetchFrame` for every index in `[0, frameCount)`, `concurrency` at a
 * time. A pool of workers share one `next` counter, so whichever worker is
 * free always claims the lowest index nobody has claimed yet — the run
 * fills front-to-back regardless of which fetch happens to resolve first.
 * `onProgress` is called once per completed frame with the running total,
 * `1..frameCount` in order (never skipped, never out of order, even though
 * the underlying fetches can finish in any order) — because incrementing
 * the counter and calling back happen synchronously right after each
 * individual `await`, and JS never interleaves two synchronous stretches of
 * code. Stops early, without finishing outstanding fetches' bookkeeping,
 * once `isAborted` turns true (checked before claiming and after fetching)
 * — the dialog's own AbortController firing should make outstanding
 * `fetchFrame` calls reject on their own; this is what stops the scheduler
 * from starting new ones once that happens.
 */
export async function preloadFrames(
  frameCount: number,
  concurrency: number,
  fetchFrame: (index: number) => Promise<void>,
  onProgress: (done: number) => void,
  isAborted: () => boolean = () => false,
  options: PreloadOptions = {},
): Promise<PreloadOutcome> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const retryDelayMs = options.retryDelayMs ?? 250;
  let next = 0;
  let done = 0;
  let aborted = false;

  // One transient failure must not take the whole run down: retry with a
  // short backoff, and if a frame still fails, report it and move on — the
  // viewer fetches such a frame on demand (or shows it as unavailable) and
  // the progress bar still completes, so Play unlocks.
  async function fetchWithRetries(index: number): Promise<void> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await fetchFrame(index);
        return;
      } catch (error) {
        if (isAborted() || attempt >= attempts) {
          if (!isAborted()) {
            options.onFrameFailed?.(index);
          }
          return;
        }
        const delay = retryDelayMs * 2 ** (attempt - 1);
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
  }

  async function worker(): Promise<void> {
    for (;;) {
      if (isAborted()) {
        aborted = true;
        return;
      }
      const index = next < frameCount ? next++ : null;
      if (index == null) {
        return;
      }
      await fetchWithRetries(index);
      if (isAborted()) {
        aborted = true;
        return;
      }
      done += 1;
      onProgress(done);
    }
  }

  const workerCount = Math.max(0, Math.min(concurrency, frameCount));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return aborted ? "aborted" : "done";
}
