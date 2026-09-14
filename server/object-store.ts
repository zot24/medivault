import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import type { Readable } from "stream";

export type ObjectKey = string & { readonly __brand: "ObjectKey" };

export type StoredObject = {
  key: ObjectKey;
  bytes: Buffer;
  contentType: string;
};

/**
 * Either the whole object in memory, or a stream plus its known size — the
 * shape a large DICOM upload (plan 07) is put in, so a ~100 MB file is
 * never fully buffered on its way from the multer temp file to the object
 * store.
 */
export type PutInput =
  | { key: ObjectKey; bytes: Buffer; contentType: string }
  | { key: ObjectKey; stream: Readable; size: number; contentType: string };

export interface ObjectStore {
  put(input: PutInput): Promise<void>;
  get(key: ObjectKey): Promise<StoredObject | null>;
  /**
   * Bytes `start` through `end`, both inclusive (matching the HTTP Range
   * header's own convention). Null when the object doesn't exist. Used for
   * angiography cine frames (plan 07): a frame is a fixed byte range, and
   * this lets the server serve one without downloading the whole ~100 MB
   * file first.
   */
  getRange(key: ObjectKey, start: number, end: number): Promise<Buffer | null>;
  delete(key: ObjectKey): Promise<void>;
}

export type ObjectStoreConfig =
  | {
      kind: "supabase";
      url: string;
      serviceRoleKey: string;
      bucket: string;
    }
  | {
      kind: "disk";
      root: string;
    };

export class ObjectStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectStoreConfigError";
  }
}

function isProduction(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL === "1" || env.NODE_ENV === "production";
}

export function parseObjectStoreConfig(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStoreConfig {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = env.SUPABASE_STORAGE_BUCKET?.trim();

  if (url && serviceRoleKey && bucket) {
    if (bucket.includes("/") || bucket.includes("\\")) {
      throw new ObjectStoreConfigError(
        "SUPABASE_STORAGE_BUCKET must be a bucket name, not a path",
      );
    }
    return { kind: "supabase", url, serviceRoleKey, bucket };
  }

  if (isProduction(env)) {
    throw new ObjectStoreConfigError(
      "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_STORAGE_BUCKET. Local uploads/ is not used on Vercel.",
    );
  }

  return {
    kind: "disk",
    root: path.resolve(env.UPLOAD_DIR || "uploads"),
  };
}

export function asObjectKey(value: string): ObjectKey {
  return value as ObjectKey;
}

/** Reads a stream fully into memory — only used by stores that need bytes in hand (Memory, Supabase upload). */
async function bufferFromStream(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<
    string,
    { bytes: Buffer; contentType: string }
  >();

  async put(input: PutInput): Promise<void> {
    const bytes = "stream" in input ? await bufferFromStream(input.stream) : input.bytes;
    this.objects.set(input.key, {
      bytes: Buffer.from(bytes),
      contentType: input.contentType,
    });
  }

  async get(key: ObjectKey): Promise<StoredObject | null> {
    const stored = this.objects.get(key);
    if (!stored) {
      return null;
    }
    return {
      key,
      bytes: Buffer.from(stored.bytes),
      contentType: stored.contentType,
    };
  }

  async getRange(key: ObjectKey, start: number, end: number): Promise<Buffer | null> {
    const stored = this.objects.get(key);
    if (!stored) {
      return null;
    }
    return Buffer.from(stored.bytes.subarray(start, end + 1));
  }

  async delete(key: ObjectKey): Promise<void> {
    this.objects.delete(key);
  }
}

export class DiskObjectStore implements ObjectStore {
  constructor(private readonly root: string) {}

  private resolve(key: ObjectKey): string {
    const resolved = path.resolve(this.root, key);
    const rootWithSep = this.root.endsWith(path.sep)
      ? this.root
      : this.root + path.sep;
    if (resolved !== this.root && !resolved.startsWith(rootWithSep)) {
      throw new Error("Object key escapes upload root");
    }
    return resolved;
  }

  async put(input: PutInput): Promise<void> {
    const filePath = this.resolve(input.key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    if ("stream" in input) {
      await new Promise<void>((resolve, reject) => {
        const dest = fs.createWriteStream(filePath);
        input.stream.on("error", reject);
        dest.on("error", reject);
        dest.on("finish", resolve);
        input.stream.pipe(dest);
      });
      return;
    }
    await fs.promises.writeFile(filePath, input.bytes);
  }

  async get(key: ObjectKey): Promise<StoredObject | null> {
    const filePath = this.resolve(key);
    try {
      const bytes = await fs.promises.readFile(filePath);
      return { key, bytes, contentType: "application/octet-stream" };
    } catch {
      return null;
    }
  }

  async getRange(key: ObjectKey, start: number, end: number): Promise<Buffer | null> {
    const filePath = this.resolve(key);
    try {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        const stream = fs.createReadStream(filePath, { start, end });
        stream.on("data", (chunk) => chunks.push(chunk as Buffer));
        stream.on("end", () => resolve());
        stream.on("error", reject);
      });
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  async delete(key: ObjectKey): Promise<void> {
    const filePath = this.resolve(key);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // missing object is success
    }
  }
}

type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
  },
) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export class SupabaseObjectStore implements ObjectStore {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  private client() {
    return createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async put(input: PutInput): Promise<void> {
    const { error } = await this.client()
      .storage.from(this.bucket)
      .upload(input.key, "stream" in input ? input.stream : input.bytes, {
        contentType: input.contentType,
        upsert: false,
        // Required for a Node Readable body: makes supabase-js's fetch call
        // stream the request instead of buffering it first.
        ...("stream" in input ? { duplex: "half" } : {}),
      });
    if (error) {
      throw error;
    }
  }

  async get(key: ObjectKey): Promise<StoredObject | null> {
    const { data, error } = await this.client()
      .storage.from(this.bucket)
      .download(key);
    if (error || !data) {
      return null;
    }
    return {
      key,
      bytes: Buffer.from(await data.arrayBuffer()),
      contentType: data.type || "application/octet-stream",
    };
  }

  /**
   * A `Range` request straight to Storage's REST endpoint — supabase-js's
   * `.download()` has no range parameter, and Supabase Storage answers
   * `Range` requests with `206 Partial Content` (verified on the reference
   * case; see docs/plans/07-angiography-range.md).
   */
  async getRange(key: ObjectKey, start: number, end: number): Promise<Buffer | null> {
    const response = await this.fetchImpl(
      `${this.url}/storage/v1/object/authenticated/${this.bucket}/${key}`,
      {
        headers: {
          Authorization: `Bearer ${this.serviceRoleKey}`,
          Range: `bytes=${start}-${end}`,
        },
      },
    );
    if (!response.ok) {
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  }

  async delete(key: ObjectKey): Promise<void> {
    const { error } = await this.client().storage.from(this.bucket).remove([key]);
    if (error && !/not found|object not found/i.test(error.message)) {
      throw error;
    }
  }
}

export function createObjectStoreFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStore {
  const config = parseObjectStoreConfig(env);
  if (config.kind === "supabase") {
    return new SupabaseObjectStore(
      config.url,
      config.serviceRoleKey,
      config.bucket,
    );
  }
  return new DiskObjectStore(config.root);
}
