import { describe, expect, it } from "vitest";
import { thumbnailCacheKey } from "./thumbnail-cache";

describe("thumbnailCacheKey", () => {
  it("differs for two different signed-in users looking at the same document", () => {
    const first = thumbnailCacheKey("user-a", 42, 0);
    const second = thumbnailCacheKey("user-b", 42, 0);
    expect(first).not.toBe(second);
  });

  it("is stable for the same user, document, and position", () => {
    expect(thumbnailCacheKey("user-a", 42, 0)).toBe(thumbnailCacheKey("user-a", 42, 0));
  });

  it("still varies by document id and position for the same user", () => {
    const base = thumbnailCacheKey("user-a", 42, 0);
    expect(thumbnailCacheKey("user-a", 43, 0)).not.toBe(base);
    expect(thumbnailCacheKey("user-a", 42, 1)).not.toBe(base);
  });

  it("differs between a signed-in user and no user at all", () => {
    expect(thumbnailCacheKey("user-a", 42, 0)).not.toBe(thumbnailCacheKey(null, 42, 0));
  });
});
