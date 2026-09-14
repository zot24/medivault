import { describe, expect, it, vi } from "vitest";
import {
  MemoryObjectStore,
  ObjectTooLargeError,
  SupabaseObjectStore,
  asObjectKey,
  isObjectTooLargeError,
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

  it("getRange returns an inclusive byte slice, matching the HTTP Range convention", async () => {
    const store = new MemoryObjectStore();
    const key = asObjectKey("owner-1/run.dcm");
    await store.put({
      key,
      bytes: Buffer.from("0123456789"),
      contentType: "application/dicom",
    });

    expect((await store.getRange(key, 2, 5))?.toString()).toBe("2345");
    expect((await store.getRange(key, 0, 0))?.toString()).toBe("0");
  });

  it("getRange returns null for a missing object", async () => {
    const store = new MemoryObjectStore();
    expect(await store.getRange(asObjectKey("owner-1/missing.dcm"), 0, 3)).toBeNull();
  });
});

describe("isObjectTooLargeError", () => {
  it("recognizes a 413 status regardless of message", () => {
    expect(isObjectTooLargeError({ status: 413, message: "nope" })).toBe(true);
  });

  it("recognizes storage-js's statusCode string field", () => {
    expect(isObjectTooLargeError({ statusCode: "413", message: "nope" })).toBe(true);
  });

  it("recognizes the maximum-allowed-size message even without a numeric status", () => {
    expect(
      isObjectTooLargeError({
        message: "The object exceeded the maximum allowed size",
      }),
    ).toBe(true);
  });

  it("rejects an unrelated storage error", () => {
    expect(isObjectTooLargeError({ status: 404, message: "not found" })).toBe(false);
    expect(isObjectTooLargeError(new Error("network down"))).toBe(false);
    expect(isObjectTooLargeError(null)).toBe(false);
  });
});

describe("SupabaseObjectStore.put", () => {
  it("maps a too-large upload error to ObjectTooLargeError", async () => {
    const upload = vi.fn(async () => ({
      error: { status: 413, message: "The object exceeded the maximum allowed size" },
    }));
    const fakeClient = { storage: { from: () => ({ upload, download: vi.fn(), remove: vi.fn() }) } };
    const store = new SupabaseObjectStore(
      "http://127.0.0.1:54421",
      "test-service-role",
      "medical-files",
      undefined,
      fakeClient as any,
    );

    await expect(
      store.put({
        key: asObjectKey("owner-1/run.dcm"),
        bytes: Buffer.from("bytes"),
        contentType: "application/dicom",
      }),
    ).rejects.toBeInstanceOf(ObjectTooLargeError);
  });

  it("rethrows an unrelated upload error unchanged", async () => {
    const upload = vi.fn(async () => ({ error: { status: 403, message: "forbidden" } }));
    const fakeClient = { storage: { from: () => ({ upload, download: vi.fn(), remove: vi.fn() }) } };
    const store = new SupabaseObjectStore(
      "http://127.0.0.1:54421",
      "test-service-role",
      "medical-files",
      undefined,
      fakeClient as any,
    );

    await expect(
      store.put({
        key: asObjectKey("owner-1/run.dcm"),
        bytes: Buffer.from("bytes"),
        contentType: "application/dicom",
      }),
    ).rejects.toEqual({ status: 403, message: "forbidden" });
  });
});

describe("SupabaseObjectStore.getRange", () => {
  it("fetches the storage REST endpoint with a Range header and a bearer service-role key", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 206,
      arrayBuffer: async () => new TextEncoder().encode("frame-bytes").buffer,
    }));
    const store = new SupabaseObjectStore(
      "http://127.0.0.1:54421",
      "test-service-role",
      "medical-files",
      fetchImpl as any,
    );

    const result = await store.getRange(
      asObjectKey("owner-1/run.dcm"),
      1000,
      1999,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:54421/storage/v1/object/authenticated/medical-files/owner-1/run.dcm",
      {
        headers: {
          Authorization: "Bearer test-service-role",
          Range: "bytes=1000-1999",
        },
      },
    );
    expect(result?.toString()).toBe("frame-bytes");
  });

  it("returns null when the range request fails", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 416,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));
    const store = new SupabaseObjectStore(
      "http://127.0.0.1:54421",
      "test-service-role",
      "medical-files",
      fetchImpl as any,
    );

    expect(await store.getRange(asObjectKey("owner-1/run.dcm"), 0, 9)).toBeNull();
  });

  it("drains the response body on a failed range request instead of leaking the connection", async () => {
    const arrayBuffer = vi.fn(async () => new ArrayBuffer(0));
    const fetchImpl = vi.fn(async () => ({
      ok: false,
      status: 416,
      arrayBuffer,
    }));
    const store = new SupabaseObjectStore(
      "http://127.0.0.1:54421",
      "test-service-role",
      "medical-files",
      fetchImpl as any,
    );

    await store.getRange(asObjectKey("owner-1/run.dcm"), 0, 9);

    expect(arrayBuffer).toHaveBeenCalled();
  });
});
