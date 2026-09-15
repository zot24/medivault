import { describe, expect, it, vi } from "vitest";
import { failedTasks, runImport, type ImportSeriesTask, type SeriesProgress } from "./import-runner";

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
      return { id: t.key === "a" ? 1 : 2 };
    });
    const sendAppend = vi.fn(async (id: number, files: FakeFile[]) => {
      calls.push(`append ${id} (${files.length})`);
    });

    const tasks = [task("a", 1), task("b", 1)];
    await runImport(tasks, { sendCreate, sendAppend, chunkSize: 50 });

    expect(calls).toEqual(["create a (1)", "create b (1)"]);
  });

  it("sends the first chunk with sendCreate and every further chunk with sendAppend, in order", async () => {
    const calls: string[] = [];
    const sendCreate = vi.fn(async (_t: ImportSeriesTask<FakeFile>, files: FakeFile[]) => {
      calls.push(`create (${files.length})`);
      return { id: 42 };
    });
    const sendAppend = vi.fn(async (id: number, files: FakeFile[]) => {
      calls.push(`append ${id} (${files.length})`);
    });

    // chunkSize 2 over 5 files -> chunks of 2, 2, 1.
    await runImport([task("a", 5)], { sendCreate, sendAppend, chunkSize: 2 });

    expect(calls).toEqual(["create (2)", "append 42 (2)", "append 42 (1)"]);
  });

  it("reports running progress after every chunk, ending in done", async () => {
    const sendCreate = vi.fn(async () => ({ id: 1 }));
    const sendAppend = vi.fn(async () => {});
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
      return { id: 2 };
    });
    const sendAppend = vi.fn(async () => {});

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
    const sendCreate = vi.fn(async () => ({ id: 1 }));
    const sendAppend = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("chunk 2 failed"));

    const results = await runImport([task("a", 6)], { sendCreate, sendAppend, chunkSize: 2 });

    expect(sendAppend).toHaveBeenCalledTimes(2);
    expect(results[0].status).toBe("failed");
    expect(results[0].sent).toBe(4); // create (2) + first append (2) landed before the failure
  });

  it("failedTasks picks out only the series that failed, in original order", async () => {
    const sendCreate = vi.fn(async (t: ImportSeriesTask<FakeFile>) => {
      if (t.key === "b") {
        throw new Error("boom");
      }
      return { id: 1 };
    });
    const sendAppend = vi.fn(async () => {});

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
      return { id: 1 };
    });
    const sendAppend = vi.fn(async () => {});

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
});
