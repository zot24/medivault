import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

export type ObjectKey = string & { readonly __brand: "ObjectKey" };

export type StoredObject = {
  key: ObjectKey;
  bytes: Buffer;
  contentType: string;
};

export interface ObjectStore {
  put(input: {
    key: ObjectKey;
    bytes: Buffer;
    contentType: string;
  }): Promise<void>;
  get(key: ObjectKey): Promise<StoredObject | null>;
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

export class MemoryObjectStore implements ObjectStore {
  private readonly objects = new Map<
    string,
    { bytes: Buffer; contentType: string }
  >();

  async put(input: {
    key: ObjectKey;
    bytes: Buffer;
    contentType: string;
  }): Promise<void> {
    this.objects.set(input.key, {
      bytes: Buffer.from(input.bytes),
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

  async delete(key: ObjectKey): Promise<void> {
    this.objects.delete(key);
  }
}

class DiskObjectStore implements ObjectStore {
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

  async put(input: {
    key: ObjectKey;
    bytes: Buffer;
    contentType: string;
  }): Promise<void> {
    const filePath = this.resolve(input.key);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
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

  async delete(key: ObjectKey): Promise<void> {
    const filePath = this.resolve(key);
    try {
      await fs.promises.unlink(filePath);
    } catch {
      // missing object is success
    }
  }
}

class SupabaseObjectStore implements ObjectStore {
  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly bucket: string,
  ) {}

  private client() {
    return createClient(this.url, this.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async put(input: {
    key: ObjectKey;
    bytes: Buffer;
    contentType: string;
  }): Promise<void> {
    const { error } = await this.client()
      .storage.from(this.bucket)
      .upload(input.key, input.bytes, {
        contentType: input.contentType,
        upsert: false,
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
