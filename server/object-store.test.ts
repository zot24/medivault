import { describe, expect, it } from "vitest";
import {
  MemoryObjectStore,
  asObjectKey,
  parseObjectStoreConfig,
} from "./object-store";

describe("parseObjectStoreConfig", () => {
  it("uses Supabase Storage when url, service role, and bucket are set", () => {
    expect(
      parseObjectStoreConfig({
        SUPABASE_URL: "http://127.0.0.1:54421",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
        SUPABASE_STORAGE_BUCKET: "medical-files",
      }),
    ).toEqual({
      kind: "supabase",
      url: "http://127.0.0.1:54421",
      serviceRoleKey: "test-service-role",
      bucket: "medical-files",
    });
  });

  it("refuses local disk when VERCEL=1 and Supabase env is missing", () => {
    expect(() =>
      parseObjectStoreConfig({
        VERCEL: "1",
        NODE_ENV: "production",
      }),
    ).toThrow(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET. Local uploads/ is not used on Vercel.",
    );
  });

  it("uses UPLOAD_DIR on a non-production process without Supabase env", () => {
    expect(
      parseObjectStoreConfig({
        NODE_ENV: "development",
        UPLOAD_DIR: "/tmp/mv-uploads",
      }),
    ).toEqual({
      kind: "disk",
      root: "/tmp/mv-uploads",
    });
  });
});

describe("MemoryObjectStore", () => {
  it("returns the same bytes that were put", async () => {
    const store = new MemoryObjectStore();
    const key = asObjectKey("user-1/a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf");

    await store.put({
      key,
      bytes: Buffer.from("%PDF-hello"),
      contentType: "application/pdf",
    });

    const got = await store.get(key);
    expect(got).toEqual({
      key,
      bytes: Buffer.from("%PDF-hello"),
      contentType: "application/pdf",
    });
  });
});
