import { describe, expect, it } from "vitest";
import { OWNED, fileUrl, filesListUrl, frameRangeUrl, frameUrl, sharedSource, sourceKey } from "./file-source";

describe("file-source", () => {
  it("builds the owner's endpoints", () => {
    expect(filesListUrl(OWNED, 7)).toBe("/api/documents/7/files");
    expect(fileUrl(OWNED, 7, 3)).toBe("/api/documents/7/files/3");
    expect(frameUrl(OWNED, 7, 0, 12)).toBe("/api/documents/7/files/0/frames/12");
    expect(frameRangeUrl(OWNED, 7, 0, 8, 15)).toBe("/api/documents/7/files/0/frames/8-15");
  });

  it("builds the visitor's token-scoped endpoints, escaping the token", () => {
    const shared = sharedSource("abc/def");
    expect(filesListUrl(shared, 7)).toBe("/api/s/abc%2Fdef/documents/7/files");
    expect(fileUrl(shared, 7, 3)).toBe("/api/s/abc%2Fdef/documents/7/files/3");
    expect(frameUrl(shared, 7, 0, 12)).toBe("/api/s/abc%2Fdef/documents/7/files/0/frames/12");
    expect(frameRangeUrl(shared, 7, 0, 8, 15)).toBe("/api/s/abc%2Fdef/documents/7/files/0/frames/8-15");
  });

  it("keys caches separately for owner and each token", () => {
    expect(sourceKey(OWNED)).toBe("owned");
    expect(sourceKey(sharedSource("t1"))).toBe("shared:t1");
    expect(sourceKey(sharedSource("t1"))).not.toBe(sourceKey(sharedSource("t2")));
  });
});
