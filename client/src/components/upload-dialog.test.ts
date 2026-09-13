import { describe, it, expect, vi, afterEach } from "vitest";
import { postFiles } from "./upload-dialog";
import { isUnauthorizedError } from "@/lib/authUtils";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: async () => body,
  } as Response;
}

describe("postFiles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a status-prefixed error so isUnauthorizedError recognizes an expired session", async () => {
    // Mirrors server/localAuth.ts's isAuthenticated middleware, which answers
    // an expired session with 401 { message: "Unauthorized" }.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { message: "Unauthorized" })));

    const error = await postFiles("/api/documents", new FormData(), []).catch((e) => e as Error);

    expect(error).toBeInstanceOf(Error);
    expect(isUnauthorizedError(error as Error)).toBe(true);
  });

  it("surfaces the server's message for a non-auth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(413, { message: "File too large. Maximum is 50 MB per file." }),
      ),
    );

    const error = await postFiles("/api/documents", new FormData(), []).catch((e) => e as Error);

    expect((error as Error).message).toBe("413: File too large. Maximum is 50 MB per file.");
    expect(isUnauthorizedError(error as Error)).toBe(false);
  });
});
