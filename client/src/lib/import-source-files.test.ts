import { describe, expect, it } from "vitest";
import { buildSourceFiles, type ReadableFile } from "./import-source-files";

// A stand-in for File, so this stays a pure Node test with no DOM.
type FakeFile = ReadableFile & { name: string };

function goodFile(name: string, byte: number): FakeFile {
  return {
    name,
    size: 1,
    slice: () => ({ arrayBuffer: async () => new Uint8Array([byte]).buffer }),
  };
}

/** A file whose head read rejects — a scratched-disc I/O error, a transient read failure, a permission error. */
function unreadableFile(name: string, message: string): FakeFile {
  return {
    name,
    size: 1,
    slice: () => ({
      arrayBuffer: () => Promise.reject(new Error(message)),
    }),
  };
}

const pathFor = (file: FakeFile, index: number) => `${index}:${file.name}`;

describe("buildSourceFiles", () => {
  it("reads every file's head bytes into a source, in arrival order", async () => {
    const files = [goodFile("a.dcm", 1), goodFile("b.dcm", 2), goodFile("c.dcm", 3)];

    const result = await buildSourceFiles(files, pathFor);

    expect(result.sources.map((s) => s.path)).toEqual(["0:a.dcm", "1:b.dcm", "2:c.dcm"]);
    expect(result.unreadable).toEqual([]);
    expect(result.byPath.get("0:a.dcm")).toBe(files[0]);
  });

  it("keeps the other files readable when one file's head read rejects", async () => {
    // A real hospital-CD folder has thousands of files; one bad read (a
    // scratched disc, a transient I/O error) must never take down the rest.
    const files = [goodFile("a.dcm", 1), unreadableFile("b.dcm", "I/O error"), goodFile("c.dcm", 3)];

    const result = await buildSourceFiles(files, pathFor);

    expect(result.sources.map((s) => s.path)).toEqual(["0:a.dcm", "2:c.dcm"]);
    expect(result.unreadable).toEqual([{ path: "1:b.dcm", reason: "couldn't be read — I/O error" }]);
  });

  it("reports every unreadable file, not just the first", async () => {
    const files = [
      unreadableFile("a.dcm", "disc error"),
      goodFile("b.dcm", 2),
      unreadableFile("c.dcm", "permission denied"),
    ];

    const result = await buildSourceFiles(files, pathFor);

    expect(result.sources.map((s) => s.path)).toEqual(["1:b.dcm"]);
    expect(result.unreadable).toEqual([
      { path: "0:a.dcm", reason: "couldn't be read — disc error" },
      { path: "2:c.dcm", reason: "couldn't be read — permission denied" },
    ]);
  });

  it("still populates byPath for a file whose head read fails, so it can be looked back up", async () => {
    const files = [unreadableFile("a.dcm", "disc error")];

    const result = await buildSourceFiles(files, pathFor);

    expect(result.byPath.get("0:a.dcm")).toBe(files[0]);
  });

  it("reads in bounded batches rather than all files at once, while still skipping (not failing on) an unreadable file", async () => {
    // Round 1 fixed the "one bad read must not be fatal" behaviour; round 2
    // asked that this also never opens more than `batchSize` reads at once
    // — cover both in one test.
    const batchSize = 2;
    let inFlight = 0;
    let maxInFlight = 0;

    function trackedFile(name: string, shouldFail: boolean): FakeFile {
      return {
        name,
        size: 1,
        slice: () => ({
          arrayBuffer: async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            // Yield so overlapping reads within a batch are actually
            // concurrent, and a bug that reads everything at once would
            // show up as inFlight exceeding batchSize.
            await new Promise((resolve) => setTimeout(resolve, 0));
            inFlight -= 1;
            if (shouldFail) {
              throw new Error("I/O error");
            }
            return new Uint8Array([1]).buffer;
          },
        }),
      };
    }

    const files = [
      trackedFile("a.dcm", false),
      trackedFile("b.dcm", false),
      trackedFile("c.dcm", true),
      trackedFile("d.dcm", false),
      trackedFile("e.dcm", false),
    ];

    const result = await buildSourceFiles(files, pathFor, { batchSize });

    expect(maxInFlight).toBeLessThanOrEqual(batchSize);
    expect(result.sources.map((s) => s.path)).toEqual(["0:a.dcm", "1:b.dcm", "3:d.dcm", "4:e.dcm"]);
    expect(result.unreadable).toEqual([{ path: "2:c.dcm", reason: "couldn't be read — I/O error" }]);
  });
});
