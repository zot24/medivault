import { isUncompressedMultiFrame, type DicomSeriesMeta } from "@shared/dicom-meta";
import type { DicomMono8Frame } from "@shared/dicom-frame";
import { documentFileUrl, documentFrameUrl } from "./owned-file";

/**
 * Split out of thumbnails.ts so it can be unit tested without pulling in
 * that module's `useAuth` -> `@/lib/sdk` -> `@medivault/sdk` import chain,
 * which needs packages/sdk/dist built (not part of a plain `pnpm test`
 * run — see CLAUDE.md's worktree setup step).
 */

export type ThumbnailFrameSource =
  | { kind: "frame-range"; url: string }
  | { kind: "whole-file"; url: string };

/**
 * Which endpoint a thumbnail should come from. For an uncompressed
 * multi-frame file (plan 07: an angiography cine run, ~100 MB) at position
 * 0, frame 0's own byte range is enough — fetching and parsing the whole
 * file just to draw a still would defeat the point of the range endpoint,
 * and `pixelFrameFromPart10`/`multiFrameSourceFromPart10` can't draw an
 * 8-bit uncompressed frame anyway. `dicomMeta` describes only the
 * document's first file (see readSeriesMeta's comment in
 * shared/dicom-meta.ts), so this only applies at position 0; every other
 * position falls back to fetching the whole file, as before.
 */
export function thumbnailFrameSource(
  documentId: number,
  position: number,
  dicomMeta: DicomSeriesMeta | null,
): ThumbnailFrameSource {
  if (position === 0 && dicomMeta && isUncompressedMultiFrame(dicomMeta)) {
    return { kind: "frame-range", url: documentFrameUrl(documentId, position, 0) };
  }
  return { kind: "whole-file", url: documentFileUrl(documentId, position) };
}

/**
 * A mono8 frame from the frame-range endpoint's response: raw pixel bytes
 * as the body, dimensions and window as headers (server/routes.ts) — no
 * Part 10 parsing needed, unlike the whole-file path.
 */
export async function mono8FrameFromRangeResponse(
  response: Response,
): Promise<DicomMono8Frame> {
  const rows = Number(response.headers.get("X-Frame-Rows"));
  const columns = Number(response.headers.get("X-Frame-Columns"));
  const windowCenter = Number(response.headers.get("X-Window-Center"));
  const windowWidth = Number(response.headers.get("X-Window-Width"));
  const pixels = new Uint8Array(await response.arrayBuffer());
  return { kind: "mono8", rows, columns, pixels, windowCenter, windowWidth };
}
