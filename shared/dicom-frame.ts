import dicomParser, { type DataSet } from "dicom-parser";
import { Decoder } from "jpeg-lossless-decoder-js";
import { isPart10 } from "./upload-kinds";

const UNCOMPRESSED = new Set([
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
]);

const JPEG_LOSSLESS = new Set([
  "1.2.840.10008.1.2.4.57",
  "1.2.840.10008.1.2.4.70",
]);

const RLE = "1.2.840.10008.1.2.5";

export type DicomMono16Frame = {
  kind: "mono16";
  rows: number;
  columns: number;
  pixels: Uint16Array;
  /** Stored value -> real-world units (HU for CT): value * slope + intercept. */
  rescaleSlope: number;
  rescaleIntercept: number;
  /** The file's own preset, in rescaled units. */
  windowCenter: number;
  windowWidth: number;
};

export type DicomWindow = {
  center: number;
  width: number;
};

export type DicomRgb8Frame = {
  kind: "rgb8";
  rows: number;
  columns: number;
  pixels: Uint8Array;
};

export type DicomFrame = DicomMono16Frame | DicomRgb8Frame;

export function pixelFrameFromPart10(bytes: Uint8Array): DicomFrame | null {
  if (!isPart10(bytes)) {
    return null;
  }

  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const transfer = dataSet.string("x00020010") ?? "1.2.840.10008.1.2";
    const rows = dataSet.uint16("x00280010");
    const columns = dataSet.uint16("x00280011");
    const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
    const samplesPerPixel = dataSet.uint16("x00280002") ?? 1;
    const photometric = (dataSet.string("x00280004") ?? "").trim();
    const planar = dataSet.uint16("x00280006") === 1;
    const pixelElement = dataSet.elements.x7fe00010;
    if (!rows || !columns || !pixelElement) {
      return null;
    }

    if (isMono16(photometric, bitsAllocated, samplesPerPixel)) {
      const pixels = decodeMono16(transfer, {
        bytes,
        dataSet,
        pixelElement,
        rows,
        columns,
      });
      if (!pixels || pixels.length < rows * columns) {
        return null;
      }
      return {
        kind: "mono16",
        rows,
        columns,
        pixels: pixels.subarray(0, rows * columns),
        rescaleSlope: firstDecimal(dataSet.string("x00281053")) ?? 1,
        rescaleIntercept: firstDecimal(dataSet.string("x00281052")) ?? 0,
        windowCenter: firstDecimal(dataSet.string("x00281050")) ?? 500,
        windowWidth: firstDecimal(dataSet.string("x00281051")) ?? 1000,
      };
    }

    if (isRgb8(photometric, bitsAllocated, samplesPerPixel)) {
      const pixels = decodeRgb8(transfer, {
        bytes,
        dataSet,
        pixelElement,
        rows,
        columns,
        planar,
      });
      if (!pixels || pixels.length < rows * columns * 3) {
        return null;
      }
      return {
        kind: "rgb8",
        rows,
        columns,
        pixels: pixels.subarray(0, rows * columns * 3),
      };
    }

    return null;
  } catch {
    return null;
  }
}

const JPEG_BASELINE = new Set([
  "1.2.840.10008.1.2.4.50", // JPEG Baseline (Process 1)
  "1.2.840.10008.1.2.4.51", // JPEG Extended (Process 2 & 4)
]);

/**
 * One encapsulated multi-frame JPEG object (plan 06: ultrasound cine loops).
 * Every frame is a complete baseline/extended JPEG fragment — the browser's
 * own decoder (`createImageBitmap`) handles it, YBR->RGB conversion
 * included; nothing here decodes pixels.
 */
export type EncapsulatedJpegSource = {
  kind: "jpeg-frames";
  rows: number;
  columns: number;
  frameCount: number;
  /** CineRate (fps), or 1000 / FrameTime; null for a single-frame still. */
  frameRate: number | null;
  /** The raw JPEG bytes of one frame (starts with the FF D8 SOI marker). */
  frame(index: number): Uint8Array;
};

/**
 * Reads a JPEG Baseline/Extended encapsulated pixel data element as a set of
 * per-frame JPEG fragments, without decoding any of them. Returns null for
 * every other transfer syntax (including uncompressed, JPEG Lossless, and
 * RLE, which `pixelFrameFromPart10` already handles) and for a photometric
 * interpretation this app doesn't expect (only mono or 3-sample color).
 *
 * Pixel-to-distance calibration for measurements — SequenceOfUltrasoundRegions
 * (0018,6011) — is out of scope here; this only exposes frames to draw.
 */
export function multiFrameSourceFromPart10(bytes: Uint8Array): EncapsulatedJpegSource | null {
  if (!isPart10(bytes)) {
    return null;
  }
  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const transfer = dataSet.string("x00020010") ?? "";
    if (!JPEG_BASELINE.has(transfer)) {
      return null;
    }
    const rows = dataSet.uint16("x00280010");
    const columns = dataSet.uint16("x00280011");
    const samplesPerPixel = dataSet.uint16("x00280002") ?? 1;
    const pixelElement = dataSet.elements.x7fe00010;
    if (
      !rows ||
      !columns ||
      !pixelElement ||
      !pixelElement.encapsulatedPixelData ||
      (samplesPerPixel !== 1 && samplesPerPixel !== 3)
    ) {
      return null;
    }
    // An empty Basic Offset Table is legal (DICOM PS3.5 A.4) and common; it
    // is also what `readEncapsulatedImageFrame` throws for, so index the
    // fragments ourselves in that case.
    const ranges =
      (pixelElement.basicOffsetTable?.length ?? 0) > 0
        ? null
        : frameRangesFromSoiMarkers(bytes, pixelElement.fragments ?? []);
    if (ranges && ranges.length === 0) {
      return null;
    }
    // A self-indexed source can only offer the frames it actually found,
    // whatever NumberOfFrames claims.
    const frameCount =
      ranges?.length ?? Math.max(1, firstDecimal(dataSet.string("x00280008")) ?? 1);
    const frameRate = frameRateOf(dataSet);
    const fragments = pixelElement.fragments ?? [];
    return {
      kind: "jpeg-frames",
      rows,
      columns,
      frameCount,
      frameRate,
      frame(index: number): Uint8Array {
        if (!ranges) {
          return dicomParser.readEncapsulatedImageFrame(dataSet, pixelElement, index);
        }
        const range = ranges[index];
        if (!range) {
          throw new Error(`frame ${index} is out of range (${ranges.length} frames)`);
        }
        return concatFragments(bytes, fragments.slice(range.first, range.first + range.count));
      },
    };
  } catch {
    return null;
  }
}

type FragmentRange = {
  /** Index of the frame's first fragment. */
  first: number;
  /** How many fragments the frame spans. */
  count: number;
};

/**
 * Frame boundaries recovered from the fragments themselves, for pixel data
 * whose Basic Offset Table is empty. Every JPEG stream starts with the SOI
 * marker FF D8, so a fragment beginning with it starts a frame and the
 * fragments after it — up to the next SOI — are that frame's continuation.
 * Returns [] when no fragment looks like the start of a JPEG.
 */
function frameRangesFromSoiMarkers(
  bytes: Uint8Array,
  fragments: readonly { position: number; length: number }[],
): FragmentRange[] {
  const ranges: FragmentRange[] = [];
  fragments.forEach((fragment, index) => {
    const startsFrame =
      fragment.length >= 2 &&
      bytes[fragment.position] === 0xff &&
      bytes[fragment.position + 1] === 0xd8;
    if (startsFrame) {
      ranges.push({ first: index, count: 1 });
    } else if (ranges.length > 0) {
      ranges[ranges.length - 1].count += 1;
    }
  });
  return ranges;
}

function concatFragments(
  bytes: Uint8Array,
  fragments: readonly { position: number; length: number }[],
): Uint8Array {
  if (fragments.length === 1) {
    return bytes.subarray(
      fragments[0].position,
      fragments[0].position + fragments[0].length,
    );
  }
  const total = fragments.reduce((sum, fragment) => sum + fragment.length, 0);
  const frame = new Uint8Array(total);
  let offset = 0;
  for (const fragment of fragments) {
    frame.set(bytes.subarray(fragment.position, fragment.position + fragment.length), offset);
    offset += fragment.length;
  }
  return frame;
}

/** CineRate (0018,0040) fps, else 1000 / FrameTime (0018,1063) ms, else null for a still. */
function frameRateOf(dataSet: DataSet): number | null {
  const cineRate = firstDecimal(dataSet.string("x00180040"));
  if (cineRate != null && cineRate > 0) {
    return cineRate;
  }
  const frameTime = firstDecimal(dataSet.string("x00181063"));
  if (frameTime != null && frameTime > 0) {
    return 1000 / frameTime;
  }
  return null;
}

export type DicomOverlay = {
  rows: number;
  columns: number;
  /** 1-based; where the overlay's top-left pixel sits on the image. */
  originRow: number;
  originColumn: number;
  /** One byte per pixel, 0 or 1, row-major. */
  bits: Uint8Array;
};

const OVERLAY_GROUP_FIRST = 0x6000;
const OVERLAY_GROUP_LAST = 0x601e;

/** Reads every graphics/ROI overlay plane (group 6000, 6002, ... 601e). [] when none. */
export function overlaysFromPart10(bytes: Uint8Array): DicomOverlay[] {
  if (!isPart10(bytes)) {
    return [];
  }
  let dataSet: DataSet;
  try {
    dataSet = dicomParser.parseDicom(bytes);
  } catch {
    return [];
  }

  const overlays: DicomOverlay[] = [];
  for (
    let group = OVERLAY_GROUP_FIRST;
    group <= OVERLAY_GROUP_LAST;
    group += 2
  ) {
    // Each plane is read independently: a malformed or truncated plane (bad
    // rows/columns, a short data element, a corrupt origin) is skipped, but
    // does not discard the planes that came before or after it.
    try {
      const prefix = `x${group.toString(16).padStart(4, "0")}`;
      const rows = dataSet.uint16(`${prefix}0010`);
      const columns = dataSet.uint16(`${prefix}0011`);
      const dataElement = dataSet.elements[`${prefix}3000`];
      if (!rows || !columns || !dataElement) {
        continue;
      }
      const [originRow, originColumn] = overlayOrigin(
        dataSet.int16(`${prefix}0050`, 0),
        dataSet.int16(`${prefix}0050`, 1),
      );
      overlays.push({
        rows,
        columns,
        originRow,
        originColumn,
        bits: unpackOverlayBits(bytes, dataElement, rows * columns),
      });
    } catch {
      continue;
    }
  }
  return overlays;
}

/** Overlay Origin (60xx,0050) is VR SS: two signed 16-bit values, never text. */
function overlayOrigin(
  row: number | undefined,
  column: number | undefined,
): [number, number] {
  return [
    Number.isFinite(row) ? (row as number) : 1,
    Number.isFinite(column) ? (column as number) : 1,
  ];
}

/** Little-endian bit order: bit 0 of byte 0 is pixel 0, row-major. */
function unpackOverlayBits(
  bytes: Uint8Array,
  dataElement: { dataOffset: number; length: number },
  pixelCount: number,
): Uint8Array {
  const expectedBytes = Math.ceil(pixelCount / 8);
  if (dataElement.length < expectedBytes) {
    throw new Error(
      `overlay data too short: need ${expectedBytes} bytes for ${pixelCount} pixels, got ${dataElement.length}`,
    );
  }
  const raw = bytes.subarray(
    dataElement.dataOffset,
    dataElement.dataOffset + dataElement.length,
  );
  const bits = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    bits[i] = (raw[i >> 3] >> (i & 7)) & 1;
  }
  return bits;
}

const OVERLAY_COLOR: [number, number, number] = [0, 255, 128];

/** Burns overlay planes into an RGBA buffer already produced by rgbaFromFrame. */
export function compositeOverlays(
  rgba: Uint8ClampedArray,
  frameRows: number,
  frameColumns: number,
  overlays: DicomOverlay[],
  color: [number, number, number] = OVERLAY_COLOR,
): void {
  for (const overlay of overlays) {
    for (let r = 0; r < overlay.rows; r++) {
      const frameRow = overlay.originRow - 1 + r;
      if (frameRow < 0 || frameRow >= frameRows) {
        continue;
      }
      for (let c = 0; c < overlay.columns; c++) {
        if (overlay.bits[r * overlay.columns + c] !== 1) {
          continue;
        }
        const frameColumn = overlay.originColumn - 1 + c;
        if (frameColumn < 0 || frameColumn >= frameColumns) {
          continue;
        }
        const offset = (frameRow * frameColumns + frameColumn) * 4;
        rgba[offset] = color[0];
        rgba[offset + 1] = color[1];
        rgba[offset + 2] = color[2];
        rgba[offset + 3] = 255;
      }
    }
  }
}

export function describeUndrawableFrame(bytes: Uint8Array): string {
  if (!isPart10(bytes)) {
    return "Not a DICOM Part 10 file.";
  }
  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const sopClass = dataSet.string("x00080016")?.trim() || "unknown";
    const photometric = dataSet.string("x00280004")?.trim() || "unknown";
    const bitsAllocated = dataSet.uint16("x00280100");
    const bits = bitsAllocated == null ? "unknown-bit" : `${bitsAllocated}-bit`;
    const transfer = dataSet.string("x00020010")?.trim() || "unknown";
    return `Cannot draw this file (SOP ${sopClass}, photometric ${photometric}, ${bits}, transfer ${transfer}).`;
  } catch {
    return "Could not parse this DICOM file.";
  }
}

/**
 * First value of a DS element. Scanners often write several presets in one
 * element ("345\\-600"); Number() on the raw string yields NaN.
 */
function firstDecimal(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const value = Number(raw.split("\\")[0].trim());
  return Number.isFinite(value) ? value : null;
}

/**
 * A frame's RGBA, with any overlay planes burned in — the "frame + overlays
 * → RGBA" step, factored out so the thumbnail and the viewer render a
 * secondary-capture page's overlay-only content (e.g. the CT dose sheet, or
 * a measurement snapshot's drawn line) identically and cannot drift apart.
 */
export function renderFrameRgba(
  frame: DicomFrame,
  overlays: DicomOverlay[],
  window?: DicomWindow,
): Uint8ClampedArray {
  const rgba = rgbaFromFrame(frame, window);
  if (overlays.length > 0) {
    compositeOverlays(rgba, frame.rows, frame.columns, overlays);
  }
  return rgba;
}

export function rgbaFromFrame(
  frame: DicomFrame,
  window?: DicomWindow,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(frame.rows * frame.columns * 4);
  if (frame.kind === "rgb8") {
    for (let i = 0, o = 0; i < frame.pixels.length; i += 3, o += 4) {
      rgba[o] = frame.pixels[i];
      rgba[o + 1] = frame.pixels[i + 1];
      rgba[o + 2] = frame.pixels[i + 2];
      rgba[o + 3] = 255;
    }
    return rgba;
  }
  // Window in rescaled units, mapped back to stored values so the loop stays integer-cheap.
  const center = window?.center ?? frame.windowCenter;
  const width = window?.width ?? frame.windowWidth;
  const slope = frame.rescaleSlope === 0 ? 1 : frame.rescaleSlope;
  const low = (center - width / 2 - frame.rescaleIntercept) / slope;
  const high = (center + width / 2 - frame.rescaleIntercept) / slope;
  const span = Math.max(high - low, 1e-6);
  for (let i = 0; i < frame.pixels.length; i++) {
    const gray = Math.max(
      0,
      Math.min(255, Math.round(((frame.pixels[i] - low) / span) * 255)),
    );
    const offset = i * 4;
    rgba[offset] = gray;
    rgba[offset + 1] = gray;
    rgba[offset + 2] = gray;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

type ParsedDicom = ReturnType<typeof dicomParser.parseDicom>;
type PixelElement = ParsedDicom["elements"][string];

function isMono16(
  photometric: string,
  bitsAllocated: number,
  samplesPerPixel: number,
): boolean {
  return (
    bitsAllocated === 16 &&
    samplesPerPixel === 1 &&
    (photometric === "" ||
      photometric === "MONOCHROME1" ||
      photometric === "MONOCHROME2")
  );
}

function isRgb8(
  photometric: string,
  bitsAllocated: number,
  samplesPerPixel: number,
): boolean {
  return bitsAllocated === 8 && samplesPerPixel === 3 && photometric === "RGB";
}

function decodeMono16(
  transfer: string,
  input: {
    bytes: Uint8Array;
    dataSet: ParsedDicom;
    pixelElement: PixelElement;
    rows: number;
    columns: number;
  },
): Uint16Array | null {
  if (UNCOMPRESSED.has(transfer)) {
    return decodeUncompressedMono16(input.bytes, input.pixelElement);
  }
  if (JPEG_LOSSLESS.has(transfer)) {
    return decodeJpegLossless(input.dataSet, input.pixelElement);
  }
  if (transfer === RLE) {
    return decodeRleMono16(input.dataSet, input.pixelElement, input.rows * input.columns);
  }
  return null;
}

function decodeRgb8(
  transfer: string,
  input: {
    bytes: Uint8Array;
    dataSet: ParsedDicom;
    pixelElement: PixelElement;
    rows: number;
    columns: number;
    planar: boolean;
  },
): Uint8Array | null {
  const sampleCount = input.rows * input.columns;
  if (UNCOMPRESSED.has(transfer)) {
    return decodeUncompressedRgb8(input.bytes, input.pixelElement, sampleCount, input.planar);
  }
  if (transfer === RLE) {
    return decodeRleRgb8(input.dataSet, input.pixelElement, sampleCount);
  }
  return null;
}

function decodeUncompressedMono16(
  bytes: Uint8Array,
  pixelElement: { dataOffset: number; length: number },
): Uint16Array | null {
  const raw = bytes.subarray(
    pixelElement.dataOffset,
    pixelElement.dataOffset + pixelElement.length,
  );
  return new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
}

function decodeUncompressedRgb8(
  bytes: Uint8Array,
  pixelElement: { dataOffset: number; length: number },
  sampleCount: number,
  planar: boolean,
): Uint8Array | null {
  const raw = bytes.subarray(
    pixelElement.dataOffset,
    pixelElement.dataOffset + pixelElement.length,
  );
  if (raw.length < sampleCount * 3) {
    return null;
  }
  if (!planar) {
    return raw.subarray(0, sampleCount * 3);
  }
  const rgb = new Uint8Array(sampleCount * 3);
  for (let i = 0; i < sampleCount; i++) {
    rgb[i * 3] = raw[i];
    rgb[i * 3 + 1] = raw[sampleCount + i];
    rgb[i * 3 + 2] = raw[sampleCount * 2 + i];
  }
  return rgb;
}

function decodeJpegLossless(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
): Uint16Array | null {
  const fragment = firstFrame(dataSet, pixelElement);
  if (!fragment) {
    return null;
  }
  const copy = fragment.buffer.slice(
    fragment.byteOffset,
    fragment.byteOffset + fragment.byteLength,
  );
  const decoded = new Decoder().decode(copy, 0, copy.byteLength);
  if (!(decoded instanceof Uint16Array) || decoded.length === 0) {
    return null;
  }
  return decoded;
}

function decodeRleMono16(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
  sampleCount: number,
): Uint16Array | null {
  const planes = decodeRlePlanes(dataSet, pixelElement, 2, sampleCount);
  if (!planes) {
    return null;
  }
  const pixels = new Uint16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    pixels[i] = (planes[0][i] << 8) | planes[1][i];
  }
  return pixels;
}

function decodeRleRgb8(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
  sampleCount: number,
): Uint8Array | null {
  const planes = decodeRlePlanes(dataSet, pixelElement, 3, sampleCount);
  if (!planes) {
    return null;
  }
  const pixels = new Uint8Array(sampleCount * 3);
  for (let i = 0; i < sampleCount; i++) {
    pixels[i * 3] = planes[0][i];
    pixels[i * 3 + 1] = planes[1][i];
    pixels[i * 3 + 2] = planes[2][i];
  }
  return pixels;
}

function decodeRlePlanes(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
  planeCount: number,
  sampleCount: number,
): Uint8Array[] | null {
  const fragment = firstFrame(dataSet, pixelElement);
  if (!fragment || fragment.byteLength < 64) {
    return null;
  }
  const view = new DataView(
    fragment.buffer,
    fragment.byteOffset,
    fragment.byteLength,
  );
  const segments = view.getUint32(0, true);
  if (segments < planeCount) {
    return null;
  }
  const planes: Uint8Array[] = [];
  for (let plane = 0; plane < planeCount; plane++) {
    const decoded = decodeRleSegment(
      fragment,
      view.getUint32(4 + plane * 4, true),
      segmentEnd(view, plane + 1, segments, fragment.byteLength),
      sampleCount,
    );
    if (!decoded) {
      return null;
    }
    planes.push(decoded);
  }
  return planes;
}

function segmentEnd(
  view: DataView,
  segmentIndex: number,
  segmentCount: number,
  byteLength: number,
): number {
  if (segmentIndex >= segmentCount) {
    return byteLength;
  }
  const next = view.getUint32(4 + segmentIndex * 4, true);
  return next === 0 ? byteLength : next;
}

function decodeRleSegment(
  fragment: Uint8Array,
  start: number,
  end: number,
  sampleCount: number,
): Uint8Array | null {
  if (start < 0 || end > fragment.byteLength || start >= end) {
    return null;
  }
  const out = new Uint8Array(sampleCount);
  let i = start;
  let o = 0;
  while (i < end && o < sampleCount) {
    const n = fragment[i];
    i += 1;
    if (n > 128) {
      if (i >= end) {
        return null;
      }
      const count = 257 - n;
      out.fill(fragment[i], o, o + count);
      o += count;
      i += 1;
    } else if (n < 128) {
      const count = n + 1;
      if (i + count > end) {
        return null;
      }
      out.set(fragment.subarray(i, i + count), o);
      o += count;
      i += count;
    }
  }
  return o >= sampleCount ? out : null;
}

function firstFrame(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
): Uint8Array | null {
  if (!pixelElement.encapsulatedPixelData || !pixelElement.fragments?.length) {
    return null;
  }
  if (pixelElement.basicOffsetTable && pixelElement.basicOffsetTable.length > 0) {
    return dicomParser.readEncapsulatedImageFrame(dataSet, pixelElement, 0);
  }
  return dicomParser.readEncapsulatedPixelDataFromFragments(
    dataSet,
    pixelElement,
    0,
    1,
  );
}

export type CtWindowPreset = {
  id: string;
  label: string;
  /** Undefined means "use the window stored in the file". */
  window?: DicomWindow;
};

/** Common CT windows in Hounsfield units. */
export const CT_WINDOW_PRESETS: readonly CtWindowPreset[] = [
  { id: "stored", label: "As stored" },
  { id: "cta", label: "CT angio", window: { center: 300, width: 800 } },
  { id: "soft", label: "Soft tissue", window: { center: 40, width: 400 } },
  { id: "lung", label: "Lung", window: { center: -600, width: 1500 } },
  { id: "bone", label: "Bone", window: { center: 400, width: 1800 } },
];

export function windowForPreset(id: string): DicomWindow | undefined {
  return CT_WINDOW_PRESETS.find((preset) => preset.id === id)?.window;
}

const MOSTLY_BLACK_THRESHOLD = 0.95;

/**
 * True when a frame's own stored window (`windowCenter`/`windowWidth`)
 * would render more than 95% of its pixels pure black — a sign the preset
 * belongs to a different kind of image (e.g. a dose-sheet/text page carrying
 * a CT windowing preset meant for a much wider dynamic range).
 *
 * Always false when the frame has zero dynamic range (every pixel equal —
 * e.g. a secondary-capture page whose content lives entirely in an overlay
 * plane, so its pixel data is all zero): there is no "wrong preset" to
 * recover from by auto-windowing a constant image, so this must not treat
 * that as the mismatched-preset case.
 */
export function isMostlyBlackAtStoredWindow(frame: DicomMono16Frame): boolean {
  const slope = frame.rescaleSlope === 0 ? 1 : frame.rescaleSlope;
  const low =
    (frame.windowCenter - frame.windowWidth / 2 - frame.rescaleIntercept) / slope;
  let black = 0;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < frame.pixels.length; i++) {
    const value = frame.pixels[i];
    if (value <= low) {
      black++;
    }
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (max <= min) {
    return false;
  }
  return black / frame.pixels.length > MOSTLY_BLACK_THRESHOLD;
}

const AUTO_WINDOW_BINS = 256;
const AUTO_WINDOW_LOW_PERCENTILE = 0.01;
const AUTO_WINDOW_HIGH_PERCENTILE = 0.99;

/**
 * A window (in the same rescaled units as `windowCenter`/`windowWidth`)
 * stretched to the frame's own 1st-99th percentile pixel range, via a
 * 256-bin histogram of its stored values. Used as a fallback when the
 * file's stored window doesn't match its actual pixel data (see
 * `isMostlyBlackAtStoredWindow`).
 */
export function autoWindow(frame: DicomMono16Frame): DicomWindow {
  const slope = frame.rescaleSlope === 0 ? 1 : frame.rescaleSlope;
  const pixels = frame.pixels;

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i] < min) min = pixels[i];
    if (pixels[i] > max) max = pixels[i];
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return { center: frame.windowCenter, width: frame.windowWidth };
  }

  const span = max - min;
  const histogram = new Uint32Array(AUTO_WINDOW_BINS);
  for (let i = 0; i < pixels.length; i++) {
    const bin = Math.min(
      AUTO_WINDOW_BINS - 1,
      Math.floor(((pixels[i] - min) / span) * AUTO_WINDOW_BINS),
    );
    histogram[bin]++;
  }

  const total = pixels.length;
  const lowTarget = total * AUTO_WINDOW_LOW_PERCENTILE;
  const highTarget = total * AUTO_WINDOW_HIGH_PERCENTILE;

  let cumulative = 0;
  let lowBin = 0;
  for (; lowBin < AUTO_WINDOW_BINS; lowBin++) {
    cumulative += histogram[lowBin];
    if (cumulative > lowTarget) {
      break;
    }
  }

  cumulative = 0;
  let highBin = AUTO_WINDOW_BINS - 1;
  for (; highBin >= 0; highBin--) {
    cumulative += histogram[highBin];
    if (cumulative > total - highTarget) {
      break;
    }
  }

  const lowStored = min + (lowBin / AUTO_WINDOW_BINS) * span;
  const highStored = min + ((highBin + 1) / AUTO_WINDOW_BINS) * span;
  const lowRescaled = lowStored * slope + frame.rescaleIntercept;
  const highRescaled = highStored * slope + frame.rescaleIntercept;

  return {
    center: (lowRescaled + highRescaled) / 2,
    width: Math.max(highRescaled - lowRescaled, 1),
  };
}
