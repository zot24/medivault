import { useEffect, useState } from "react";
import { pixelFrameFromPart10, rgbaFromFrame, type DicomFrame } from "@shared/dicom-frame";
import { thumbnailCacheKey } from "@shared/thumbnail-cache";
import { useAuth } from "@/hooks/useAuth";
import { documentFileUrl } from "./owned-file";

const THUMBNAIL_SIZE = 128;

/** userId:documentId:position -> data URL, or null when that file can't be drawn. */
const memoryCache = new Map<string, string | null>();

function storageKey(userId: string | null, documentId: number, position: number): string {
  return `medivault:thumbnail:${thumbnailCacheKey(userId, documentId, position)}`;
}

/** undefined means "not cached yet"; null means "cached, not drawable". */
function readCache(
  userId: string | null,
  documentId: number,
  position: number,
): string | null | undefined {
  const key = thumbnailCacheKey(userId, documentId, position);
  if (memoryCache.has(key)) {
    return memoryCache.get(key) ?? null;
  }
  try {
    const stored = window.sessionStorage.getItem(storageKey(userId, documentId, position));
    if (stored == null) {
      return undefined;
    }
    const value = stored === "" ? null : stored;
    memoryCache.set(key, value);
    return value;
  } catch {
    return undefined;
  }
}

function writeCache(
  userId: string | null,
  documentId: number,
  position: number,
  value: string | null,
) {
  memoryCache.set(thumbnailCacheKey(userId, documentId, position), value);
  try {
    window.sessionStorage.setItem(storageKey(userId, documentId, position), value ?? "");
  } catch {
    // Quota exceeded or storage disabled — the memory cache still serves this tab.
  }
}

/** Draws a frame, letterboxed, onto a THUMBNAIL_SIZE square canvas. */
function drawThumbnail(frame: DicomFrame): string | null {
  const source = document.createElement("canvas");
  source.width = frame.columns;
  source.height = frame.rows;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    return null;
  }
  const image = sourceContext.createImageData(frame.columns, frame.rows);
  image.data.set(rgbaFromFrame(frame));
  sourceContext.putImageData(image, 0, 0);

  const scale = THUMBNAIL_SIZE / Math.max(frame.rows, frame.columns);
  const width = Math.round(frame.columns * scale);
  const height = Math.round(frame.rows * scale);

  const target = document.createElement("canvas");
  target.width = THUMBNAIL_SIZE;
  target.height = THUMBNAIL_SIZE;
  const targetContext = target.getContext("2d");
  if (!targetContext) {
    return null;
  }
  targetContext.fillStyle = "#000";
  targetContext.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  targetContext.drawImage(
    source,
    (THUMBNAIL_SIZE - width) / 2,
    (THUMBNAIL_SIZE - height) / 2,
    width,
    height,
  );
  return target.toDataURL("image/png");
}

/**
 * Thumbnail for one file of a document: fetched once, decoded client-side,
 * and cached in memory and sessionStorage under a user+document+position
 * key — namespaced by the signed-in user so a thumbnail cached for one
 * account is never handed back after another user logs into the same tab.
 * Returns null while loading and once loading finishes if the file has no
 * pixel data to draw (an SR report, for instance) — callers show a document
 * icon in that case. For a multi-phase CT volume pass
 * `Math.floor(fileCount / 2)` rather than 0, so the thumbnail is mid-chest.
 */
export function useThumbnail(documentId: number, position = 0): string | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [dataUrl, setDataUrl] = useState<string | null>(
    () => readCache(userId, documentId, position) ?? null,
  );

  useEffect(() => {
    if (documentId < 0) {
      setDataUrl(null);
      return;
    }
    const cached = readCache(userId, documentId, position);
    if (cached !== undefined) {
      setDataUrl(cached);
      return;
    }

    let cancelled = false;
    setDataUrl(null);

    (async () => {
      const response = await fetch(documentFileUrl(documentId, position), {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Could not load file");
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const frame = pixelFrameFromPart10(bytes);
      return frame ? drawThumbnail(frame) : null;
    })()
      .catch(() => null)
      .then((result) => {
        if (cancelled) {
          return;
        }
        writeCache(userId, documentId, position, result);
        setDataUrl(result);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, documentId, position]);

  return dataUrl;
}
