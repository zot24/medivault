import { describe, expect, it, vi } from "vitest";
import {
  ASSUMED_UPLOAD_BYTES_PER_SECOND,
  estimateEtaSeconds,
  failedTasks,
  runImport,
  type ImportSeriesTask,
  type SeriesProgress,
} from "./import-runner";

// A stand-in for File, so this stays a pure Node test with no DOM.
type FakeFile = { name: string };

function file(name: string): FakeFile {
  return { name };
}

function task(key: string, fileCount: number): ImportSeriesTask<FakeFile> {
  return {
    key,
    title: `Series ${key}`,
    documentType: "x_ray",
    documentDate: "2026-09-14",
    files: Array.from({ length: fileCount }, (_, i) => file(`${key}-${i}`)),
  };
}

describe("runImport", () => {
  it("uploads series in task order, each via a create call then append calls per chunk", async () => {
    const calls: string[] = [];
    const sendCreate = vi.fn(async (t: ImportSeriesTask<FakeFile>, files: FakeFile[]) => {
      calls.push(`create ${t.key} (${files.length})`);
      return { id: t.key === "a" ? 1 : 2, fileCount: files.length };
    });
    const sendAppend = vi.fn(async (id: number, files: FakeFile[]) => {
      calls.push(`append ${id} (${files.length})`);
      return { fileCount: files.length };
    });

    const tasks = [task("a", 1), task("b", 1)];
    await runImport(tasks, { sendCreate, sendAppend, chunkSize: 50 });

    expect(calls).toEqual(["create a (1)", "create b (1)"]);
  });

  it("sends the first chunk with sendCreate and every further chunk with sendAppend, in order", async () => {
    const calls: string[] = [];
    let cumulative = 0;
    const sendCreate = vi.fn(async (_t: ImportSeriesTask<FakeFile>, files: FakeFile[]) => {
      calls.push(`create (${files.length})`);
      cumulative = files.length;
      return { id: 42, fileCount: cumulative };
    });
    const sendAppend = vi.fn(async (id: number, files: FakeFile[]) => {
      calls.push(`append ${id} (${files.length})`);
      cumulative += files.length;
      return { fileCount: cumulative };
    });

    // chunkSize 2 over 5 files -> chunks of 2, 2, 1.
    await runImport([task("a", 5)], { sendCreate, sendAppend, chunkSize: 2 });

    expect(calls).toEqual(["create (2)", "append 42 (2)", "append 42 (1)"]);
  });

  it("reports running progress after every chunk, ending in done", async () => {
    let cumulative = 0;
    const sendCreate = vi.fn(async (_t: ImportSeriesTask<FakeFile>, files: FakeFile[]) => {
      cumulative = files.length;
      return { id: 1, fileCount: cumulative };
    });
    const sendAppend = vi.fn(async (_id: number, files: FakeFile[]) => {
      cumulative += files.length;
      return { fileCount: cumulative };
    });
    const progress: SeriesProgress[] = [];

    await runImport([task("a", 5)], {
      sendCreate,
      sendAppend,
      chunkSize: 2,
      onProgress: (p) => progress.push(p),
    });

    expect(progress.map((p) => [p.sent, p.status])).toEqual([
      [0, "uploading"],
      [2, "uploading"],
      [4, "uploading"],
      [5, "uploading"],
      [5, "done"],
    ]);
  });

  it("marks a failed series failed without aborting the rest of the import", async () => {
    const sendCreate = vi.fn(async (t: ImportSeriesTask<FakeFile>) => {
      if (t.key === "a") {
        throw new Error("network error");
      }
      return { id: 2, fileCount: 1 };
    });
    const sendAppend = vi.fn(async () => ({ fileCount: 0 }));

    const results = await runImport([task("a", 1), task("b", 1)], {
      sendCreate,
      sendAppend,
      chunkSize: 50,
    });

    expect(results.map((r) => [r.key, r.status])).toEqual([
      ["a", "failed"],
      ["b", "done"],
    ]);
    expect(results[0].error).toContain("network error");
    // "b" still uploaded even though "a" failed first.
    expect(sendCreate).toHaveBeenCalledTimes(2);
  });

  it("stops a series at the chunk that fails, without appending later chunks", async () => {
    const sendCreate = vi.fn(async () => ({ id: 1, fileCount: 2 }));
    const sendAppend = vi
      .fn()
      .mockResolvedValueOnce({ fileCount: 4 })
      .mockRejectedValueOnce(new Error("chunk 2 failed"));

    const results = await runImport([task("a", 6)], { sendCreate, sendAppend, chunkSize: 2 });

    expect(sendAppend).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("failed");
    expect(results[0].sent).toBe(4); // create (2) + first append (2) landed before the failure, per the server's own echoed fileCount
    expect(results[0].documentId).toBe(1);
  });

  it("failedTasks picks out only the series that failed, in original order", async () => {
    const sendCreate = vi.fn(async (t: ImportSeriesTask<FakeFile>) => {
      if (t.key === "b") {
        throw new Error("boom");
      }
      return { id: 1, fileCount: 1 };
    });
    const sendAppend = vi.fn(async () => ({ fileCount: 0 }));

    const tasks = [task("a", 1), task("b", 1), task("c", 1)];
    const results = await runImport(tasks, { sendCreate, sendAppend, chunkSize: 50 });

    expect(failedTasks(tasks, results).map((t) => t.key)).toEqual(["b"]);
  });

  it("retrying with failedTasks' output only re-uploads the series that failed", async () => {
    let attempt = 0;
    const sendCreate = vi.fn(async (t: ImportSeriesTask<FakeFile>) => {
      if (t.key === "a" && attempt === 0) {
        attempt += 1;
        throw new Error("first try fails");
      }
      return { id: 1, fileCount: 1 };
    });
    const sendAppend = vi.fn(async () => ({ fileCount: 0 }));

    const tasks = [task("a", 1), task("b", 1)];
    const firstRun = await runImport(tasks, { sendCreate, sendAppend, chunkSize: 50 });
    expect(failedTasks(tasks, firstRun).map((t) => t.key)).toEqual(["a"]);

    const retryRun = await runImport(failedTasks(tasks, firstRun), {
      sendCreate,
      sendAppend,
      chunkSize: 50,
    });

    expect(retryRun.map((r) => [r.key, r.status])).toEqual([["a", "done"]]);
    expect(sendCreate).toHaveBeenCalledTimes(3); // a (fail), b (ok), a (retry, ok)
  });

  it("resumes a series that failed on chunk 3 of 5: retry appends only the remaining chunks to the same record, with no second create", async () => {
    const cumulativeByDoc = new Map<number, number>();
    const appendedChunks: string[] = [];
    let appendCallCount = 0;

    const sendCreate = vi.fn(async (_t: ImportSeriesTask<FakeFile>, files: FakeFile[]) => {
      cumulativeByDoc.set(7, files.length);
      return { id: 7, fileCount: files.length };
    });
    const sendAppend = vi.fn(async (id: number, files: FakeFile[]) => {
      appendCallCount += 1;
      // Chunk 3 of 5 overall (chunk 1 is the create; this is the second
      // append call) fails the first time it is attempted, and only then.
      if (appendCallCount === 2) {
        throw new Error("network error mid-series");
      }
      appendedChunks.push(files.map((f) => f.name).join(","));
      const cumulative = (cumulativeByDoc.get(id) ?? 0) + files.length;
      cumulativeByDoc.set(id, cumulative);
      return { fileCount: cumulative };
    });

    const tasks = [task("a", 5)];
    const firstRun = await runImport(tasks, { sendCreate, sendAppend, chunkSize: 1 });

    expect(firstRun[0].status).toBe("failed");
    expect(firstRun[0].documentId).toBe(7);
    expect(firstRun[0].sent).toBe(2); // create (1) + one successful append (1)

    const retryable = failedTasks(tasks, firstRun);
    expect(retryable).toHaveLength(1);
    expect(retryable[0].resume).toEqual({ documentId: 7, sentCount: 2 });

    const retryRun = await runImport(retryable, { sendCreate, sendAppend, chunkSize: 1 });

    expect(retryRun[0].status).toBe("done");
    expect(retryRun[0].sent).toBe(5);
    expect(retryRun[0].documentId).toBe(7);
    expect(sendCreate).toHaveBeenCalledTimes(1); // exactly one record — no orphaned duplicate
    // a-1 landed before the failure; a-2, a-3, a-4 (chunks 3-5) land on retry.
    expect(appendedChunks).toEqual(["a-1", "a-2", "a-3", "a-4"]);
  });

  it("a failure on the very first request (create) retries as a plain create, not a resume", async () => {
    const sendCreate = vi.fn(async () => {
      throw new Error("connection refused");
    });
    const sendAppend = vi.fn(async () => ({ fileCount: 0 }));

    const tasks = [task("a", 3)];
    const firstRun = await runImport(tasks, { sendCreate, sendAppend, chunkSize: 1 });

    expect(firstRun[0].status).toBe("failed");
    expect(firstRun[0].documentId).toBeUndefined();

    const retryable = failedTasks(tasks, firstRun);
    expect(retryable[0].resume).toBeUndefined();
    expect(retryable[0].files).toHaveLength(3); // full series, nothing sent yet
  });
});

describe("estimateEtaSeconds", () => {
  it("estimates from total bytes at the assumed rate before anything has been measured", () => {
    const estimate = estimateEtaSeconds(8 * ASSUMED_UPLOAD_BYTES_PER_SECOND);
    expect(estimate).toEqual({ seconds: 8, measured: false });
  });

  it("refines to the observed rate once a batch has actually been measured", () => {
    // 4 MB sent in 2 seconds -> 2 MB/s measured, well under the 8 MB/s guess.
    const measured = { bytesSent: 4 * 1024 * 1024, elapsedSeconds: 2 };
    const estimate = estimateEtaSeconds(20 * 1024 * 1024, measured);
    expect(estimate.measured).toBe(true);
    expect(estimate.seconds).toBeCloseTo(10); // 20 MB remaining / 2 MB/s
  });

  it("falls back to the assumed rate when the measured sample has no elapsed time or bytes yet", () => {
    const estimate = estimateEtaSeconds(1024, { bytesSent: 0, elapsedSeconds: 5 });
    expect(estimate.measured).toBe(false);
  });
});
