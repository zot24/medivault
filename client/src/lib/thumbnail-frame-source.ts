import { isUncompressedMultiFrame, type DicomSeriesMeta } from "@shared/dicom-meta";
import type { DicomMono8Frame } from "@shared/dicom-frame";
import { OWNED, fileUrl, frameUrl, type FileSource } from "./file-source";

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
 * What a caller knows about one file of the record, from the files list
 * (`GET .../files`): the server attaches `frameIndex` only to an
 * uncompressed multi-frame file, so its presence alone says "this file has
 * a frame range endpoint".
 */
export type ThumbnailFileHint = { frameIndex: unknown | null } | null;

/**
 * Which endpoint a thumbnail should come from. For an uncompressed
 * multi-frame file (plan 07: an angiography cine run, ~100 MB), frame 0's
 * own byte range is enough — fetching and parsing the whole file just to
 * draw a still would defeat the point of the range endpoint, and
 * `pixelFrameFromPart10`/`multiFrameSourceFromPart10` can't draw an 8-bit
 * uncompressed frame anyway. `dicomMeta` describes only the document's
 * first file (see readSeriesMeta's comment in shared/dicom-meta.ts), so on
 * its own it only settles position 0; a later position needs the file's
 * own row (`file`) to say it is range-readable, otherwise it falls back to
 * fetching the whole file, as before.
 */
export function thumbnailFrameSource(
  documentId: number,
  position: number,
  dicomMeta: DicomSeriesMeta | null,
  source: FileSource = OWNED,
  file: ThumbnailFileHint = null,
): ThumbnailFrameSource {
  const rangeReadable =
    file?.frameIndex != null ||
    (position === 0 && dicomMeta != null && isUncompressedMultiFrame(dicomMeta));
  if (rangeReadable) {
    return { kind: "frame-range", url: frameUrl(source, documentId, position, 0) };
  }
  return { kind: "whole-file", url: fileUrl(source, documentId, position) };
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
