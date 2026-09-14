import { useEffect, useState } from "react";
import {
  autoWindow,
  isMostlyBlackAtStoredWindow,
  multiFrameSourceFromPart10,
  overlaysFromPart10,
  pixelFrameFromPart10,
  renderFrameRgba,
  type DicomFrame,
  type DicomOverlay,
  type DicomWindow,
} from "@shared/dicom-frame";
import type { DicomSeriesMeta } from "@shared/dicom-meta";
import { thumbnailCacheKey } from "@shared/thumbnail-cache";
import { useAuth } from "@/hooks/useAuth";
import { mono8FrameFromRangeResponse, thumbnailFrameSource } from "./thumbnail-frame-source";

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

/**
 * A mono16 frame's own stored window, unless it would render almost
 * entirely black (a text/dose-sheet page carrying a mismatched preset), in
 * which case fall back to a min-max stretch of its actual pixel range.
 */
function windowFor(frame: DicomFrame): DicomWindow | undefined {
  if (frame.kind === "mono16" && isMostlyBlackAtStoredWindow(frame)) {
    return autoWindow(frame);
  }
  return undefined;
}

/** Letterboxes a rows x columns source canvas onto a THUMBNAIL_SIZE square. */
function letterbox(
  source: CanvasImageSource,
  rows: number,
  columns: number,
): string | null {
  const scale = THUMBNAIL_SIZE / Math.max(rows, columns);
  const width = Math.round(columns * scale);
  const height = Math.round(rows * scale);

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

/** Draws a frame, letterboxed, onto a THUMBNAIL_SIZE square canvas. */
function drawThumbnail(frame: DicomFrame, overlays: DicomOverlay[]): string | null {
  const source = document.createElement("canvas");
  source.width = frame.columns;
  source.height = frame.rows;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) {
    return null;
  }
  const image = sourceContext.createImageData(frame.columns, frame.rows);
  image.data.set(renderFrameRgba(frame, overlays, windowFor(frame)));
  sourceContext.putImageData(image, 0, 0);
  return letterbox(source, frame.rows, frame.columns);
}

/**
 * Thumbnail for an ultrasound cine loop or still (plan 06): frame 0,
 * decoded by the browser's own JPEG codec rather than anything here.
 */
function drawCineThumbnail(bitmap: ImageBitmap): string | null {
  return letterbox(bitmap, bitmap.height, bitmap.width);
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
 * Pass `dicomMeta` (the document's series metadata) when available so an
 * uncompressed multi-frame file (plan 07 angiography) can be thumbnailed
 * from a single frame range instead of the whole ~100 MB file.
 */
export function useThumbnail(
  documentId: number,
  position = 0,
  dicomMeta: DicomSeriesMeta | null = null,
): string | null {
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
      const source = thumbnailFrameSource(documentId, position, dicomMeta);
      const response = await fetch(source.url, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Could not load file");
      }
      if (source.kind === "frame-range") {
        const frame = await mono8FrameFromRangeResponse(response);
        return drawThumbnail(frame, []);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const frame = pixelFrameFromPart10(bytes);
      if (frame) {
        return drawThumbnail(frame, overlaysFromPart10(bytes));
      }
      // JPEG Baseline ultrasound (plan 06): frame 0 via the browser's own
      // JPEG decoder, whether it's a cine loop or a single still.
      const cine = multiFrameSourceFromPart10(bytes);
      if (cine) {
        const bitmap = await createImageBitmap(
          new Blob([cine.frame(0)], { type: "image/jpeg" }),
        );
        try {
          return drawCineThumbnail(bitmap);
        } finally {
          bitmap.close();
        }
      }
      return null;
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
  }, [userId, documentId, position, dicomMeta]);

  return dataUrl;
}
