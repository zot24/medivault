const PREAMBLE = 128;
const DICM = Buffer.from("DICM", "ascii");

function u16(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16LE(value);
  return buf;
}

function u32(value: number): Buffer {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value);
  return buf;
}

function tag(group: number, element: number): Buffer {
  return Buffer.concat([u16(group), u16(element)]);
}

function explicitElement(
  group: number,
  element: number,
  vr: string,
  value: Buffer,
): Buffer {
  const vrBuf = Buffer.from(vr, "ascii");
  if (vr === "OB" || vr === "OW" || vr === "UN" || vr === "SQ" || vr === "UT") {
    return Buffer.concat([
      tag(group, element),
      vrBuf,
      Buffer.alloc(2),
      u32(value.length),
      value,
    ]);
  }
  return Buffer.concat([
    tag(group, element),
    vrBuf,
    u16(value.length),
    value,
  ]);
}

function padEven(value: Buffer): Buffer {
  if (value.length % 2 === 0) {
    return value;
  }
  return Buffer.concat([value, Buffer.from([0x00])]);
}

function ui(value: string): Buffer {
  return padEven(Buffer.from(value, "ascii"));
}

function cs(value: string): Buffer {
  return padEven(Buffer.from(value, "ascii"));
}

function is(value: number): Buffer {
  return padEven(Buffer.from(String(value), "ascii"));
}

function ds(value: number | string): Buffer {
  return padEven(Buffer.from(String(value), "ascii"));
}

function us(value: number): Buffer {
  return u16(value);
}

/** VR SS is binary: each value is a signed 16-bit little-endian integer, never text. */
function ss(values: number[]): Buffer {
  const buf = Buffer.alloc(values.length * 2);
  values.forEach((value, i) => buf.writeInt16LE(value, i * 2));
  return buf;
}

export const TRANSFER_EXPLICIT_LE = "1.2.840.10008.1.2.1";
export const TRANSFER_JPEG_LOSSLESS = "1.2.840.10008.1.2.4.70";
export const TRANSFER_RLE = "1.2.840.10008.1.2.5";
export const SOP_CT_IMAGE = "1.2.840.10008.5.1.4.1.1.2";
export const SOP_SECONDARY_CAPTURE = "1.2.840.10008.5.1.4.1.1.7";
export const SOP_COMPREHENSIVE_SR = "1.2.840.10008.5.1.4.1.1.88.33";
export const SOP_BASIC_TEXT_SR = "1.2.840.10008.5.1.4.1.1.88.11";

export type MiniCtTransfer =
  | typeof TRANSFER_EXPLICIT_LE
  | typeof TRANSFER_JPEG_LOSSLESS
  | typeof TRANSFER_RLE;

export type MiniCtOverlay = {
  rows: number;
  columns: number;
  /** 1-based; both default to 1 (top-left of the image). */
  originRow?: number;
  originColumn?: number;
  /** One byte per pixel, 0 or 1, row-major. */
  pixels: Uint8Array;
  /**
   * Overrides the bytes written for (60xx,3000) instead of packing `pixels`.
   * Used to build a plane with truncated/corrupt overlay data.
   */
  rawOverlayData?: Buffer;
};

export type MiniCtOptions = {
  rows?: number;
  columns?: number;
  instanceNumber?: number;
  pixels?: Uint16Array;
  transferSyntax?: MiniCtTransfer;
  sopClass?: string;
  photometric?: string;
  bitsAllocated?: number;
  samplesPerPixel?: number;
  /**
   * Number of frames (0028,0008); >1 makes this an uncompressed multi-frame
   * fixture (plan 07 angiography runs). Only meaningful with bitsAllocated 8
   * and an uncompressed transferSyntax (the default) — pixel data is then
   * `pixels8` (or a default gradient), rows*columns*frames bytes.
   */
  frames?: number;
  /** 8-bit pixel data for `frames` > 1 / bitsAllocated 8, rows*columns*frames bytes, row-major, frame-major. */
  pixels8?: Uint8Array;
  /** DS text as written to the file; multi-valued like "345\\-600" is allowed. */
  windowCenter?: number | string;
  windowWidth?: number | string;
  rescaleIntercept?: number;
  rescaleSlope?: number;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  modality?: string;
  seriesDescription?: string;
  /** Number for a real value; a raw string (e.g. "" or "  ") to test a blank DS element. */
  sliceThickness?: number | string;
  /** (0008,0008) values, joined with backslash as DICOM stores them. */
  imageType?: string[];
  /** (0020,0032) ImagePositionPatient: x\\y\\z. Only the third (z) value is used today. */
  imagePositionPatient?: [number, number, number];
  /** (0020,1041) SliceLocation, used only when imagePositionPatient is absent. */
  sliceLocation?: number | string;
  /** (0020,9241) NominalPercentageOfCardiacPhase. */
  nominalCardiacPhase?: number | string;
  /** (0018,1060) TriggerTime, in ms. */
  triggerTime?: number | string;
  /** (0018,0040) CineRate, in fps. */
  cineRate?: number | string;
  /** (0018,1063) FrameTime, in ms. */
  frameTime?: number | string;
  /** A single graphics overlay plane at group (6000,eeee). */
  overlay?: MiniCtOverlay;
  /**
   * Multiple overlay planes, written at groups 0x6000, 0x6002, ... in order.
   * Takes precedence over `overlay` when both are given.
   */
  overlays?: MiniCtOverlay[];
};

export function buildMiniCtDicom(options: MiniCtOptions = {}): Buffer {
  const rows = options.rows ?? 16;
  const columns = options.columns ?? 16;
  const instanceNumber = options.instanceNumber ?? 1;
  const transferSyntax = options.transferSyntax ?? TRANSFER_EXPLICIT_LE;
  const pixels =
    options.pixels ??
    Uint16Array.from({ length: rows * columns }, (_, i) =>
      Math.round((i / (rows * columns - 1)) * 1000),
    );

  const sopInstance = `1.2.826.0.1.3680043.8.498.spike.${instanceNumber}`;
  const sopClass = options.sopClass ?? SOP_CT_IMAGE;
  const photometric = options.photometric ?? "MONOCHROME2";
  const bitsAllocated = options.bitsAllocated ?? 16;
  const samplesPerPixel = options.samplesPerPixel ?? 1;
  const windowCenter = options.windowCenter ?? 500;
  const windowWidth = options.windowWidth ?? 1000;

  const metaWithoutLength = Buffer.concat([
    explicitElement(0x0002, 0x0001, "OB", Buffer.from([0x00, 0x01])),
    explicitElement(0x0002, 0x0002, "UI", ui(sopClass)),
    explicitElement(0x0002, 0x0003, "UI", ui(sopInstance)),
    explicitElement(0x0002, 0x0010, "UI", ui(transferSyntax)),
    explicitElement(0x0002, 0x0012, "UI", ui("1.2.826.0.1.3680043.8.498.1")),
  ]);
  const fileMeta = Buffer.concat([
    explicitElement(0x0002, 0x0000, "UL", u32(metaWithoutLength.length)),
    metaWithoutLength,
  ]);

  const frames = options.frames ?? 1;
  const pixelBytes =
    transferSyntax === TRANSFER_JPEG_LOSSLESS
      ? encapsulatedPixelData(encodeJpegLossless(pixels, rows, columns))
      : transferSyntax === TRANSFER_RLE
        ? encapsulatedPixelData(encodeRle(pixels))
        : bitsAllocated === 8
          ? explicitElement(
              0x7fe0,
              0x0010,
              "OB",
              padEven(
                Buffer.from(
                  options.pixels8 ?? defaultPixels8(rows, columns, frames),
                ),
              ),
            )
          : explicitElement(
              0x7fe0,
              0x0010,
              "OW",
              Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
            );

  const modality = options.modality ?? "CT";
  const studyInstanceUid =
    options.studyInstanceUid ?? "1.2.826.0.1.3680043.8.498.study.1";
  const seriesInstanceUid =
    options.seriesInstanceUid ?? "1.2.826.0.1.3680043.8.498.series.1";

  const dataset = Buffer.concat([
    ...(options.imageType
      ? [explicitElement(0x0008, 0x0008, "CS", cs(options.imageType.join("\\")))]
      : []),
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs(modality)),
    ...(options.seriesDescription
      ? [explicitElement(0x0008, 0x103e, "LO", cs(options.seriesDescription))]
      : []),
    ...(options.sliceThickness != null
      ? [explicitElement(0x0018, 0x0050, "DS", ds(options.sliceThickness))]
      : []),
    ...(options.triggerTime != null
      ? [explicitElement(0x0018, 0x1060, "DS", ds(options.triggerTime))]
      : []),
    ...(options.cineRate != null
      ? [explicitElement(0x0018, 0x0040, "IS", ds(options.cineRate))]
      : []),
    ...(options.frameTime != null
      ? [explicitElement(0x0018, 0x1063, "DS", ds(options.frameTime))]
      : []),
    explicitElement(0x0020, 0x000d, "UI", ui(studyInstanceUid)),
    explicitElement(0x0020, 0x000e, "UI", ui(seriesInstanceUid)),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    ...(options.imagePositionPatient
      ? [
          explicitElement(
            0x0020,
            0x0032,
            "DS",
            ds(options.imagePositionPatient.join("\\")),
          ),
        ]
      : []),
    ...(options.sliceLocation != null
      ? [explicitElement(0x0020, 0x1041, "DS", ds(options.sliceLocation))]
      : []),
    ...(options.nominalCardiacPhase != null
      ? [explicitElement(0x0020, 0x9241, "DS", ds(options.nominalCardiacPhase))]
      : []),
    explicitElement(0x0028, 0x0002, "US", us(samplesPerPixel)),
    explicitElement(0x0028, 0x0004, "CS", cs(photometric)),
    ...(options.frames != null
      ? [explicitElement(0x0028, 0x0008, "IS", is(options.frames))]
      : []),
    explicitElement(0x0028, 0x0010, "US", us(rows)),
    explicitElement(0x0028, 0x0011, "US", us(columns)),
    explicitElement(0x0028, 0x0100, "US", us(bitsAllocated)),
    explicitElement(0x0028, 0x0101, "US", us(bitsAllocated)),
    explicitElement(0x0028, 0x0102, "US", us(Math.max(bitsAllocated - 1, 0))),
    explicitElement(0x0028, 0x0103, "US", us(0)),
    explicitElement(0x0028, 0x1050, "DS", ds(windowCenter)),
    explicitElement(0x0028, 0x1051, "DS", ds(windowWidth)),
    ...(options.rescaleIntercept != null
      ? [explicitElement(0x0028, 0x1052, "DS", ds(options.rescaleIntercept))]
      : []),
    ...(options.rescaleSlope != null
      ? [explicitElement(0x0028, 0x1053, "DS", ds(options.rescaleSlope))]
      : []),
    ...overlaysFor(options).map((overlay, i) =>
      overlayElements(overlay, 0x6000 + i * 2),
    ),
    pixelBytes,
  ]);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

/** A distinct byte pattern per frame (frame index * 16 + pixel index, wrapped) so tests can tell frames apart. */
function defaultPixels8(rows: number, columns: number, frames: number): Uint8Array {
  const perFrame = rows * columns;
  const pixels = new Uint8Array(perFrame * frames);
  for (let frame = 0; frame < frames; frame++) {
    for (let i = 0; i < perFrame; i++) {
      pixels[frame * perFrame + i] = (frame * 16 + i) % 256;
    }
  }
  return pixels;
}

function overlaysFor(options: MiniCtOptions): MiniCtOverlay[] {
  if (options.overlays) {
    return options.overlays;
  }
  return options.overlay ? [options.overlay] : [];
}

/** Emits the six elements of one graphics overlay plane at group (6000,eeee). */
function overlayElements(overlay: MiniCtOverlay, group = 0x6000): Buffer {
  const originRow = overlay.originRow ?? 1;
  const originColumn = overlay.originColumn ?? 1;
  const data = overlay.rawOverlayData ?? packOverlayBits(overlay.pixels);
  return Buffer.concat([
    explicitElement(group, 0x0010, "US", us(overlay.rows)),
    explicitElement(group, 0x0011, "US", us(overlay.columns)),
    explicitElement(group, 0x0040, "CS", cs("G")),
    explicitElement(group, 0x0050, "SS", ss([originRow, originColumn])),
    explicitElement(group, 0x0100, "US", us(1)),
    explicitElement(group, 0x0102, "US", us(0)),
    explicitElement(group, 0x3000, "OW", data),
  ]);
}

/** Packs 0|1 pixels little-endian bit order (bit 0 of byte 0 is pixel 0), padded to a byte at the end. */
function packOverlayBits(pixels: Uint8Array): Buffer {
  const packed = Buffer.alloc(Math.ceil(pixels.length / 8));
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i]) {
      packed[i >> 3] |= 1 << (i & 7);
    }
  }
  return padEven(packed);
}

function encapsulatedPixelData(fragment: Buffer): Buffer {
  const even =
    fragment.length % 2 === 0
      ? fragment
      : Buffer.concat([fragment, Buffer.from([0x00])]);
  return Buffer.concat([
    tag(0x7fe0, 0x0010),
    Buffer.from("OB", "ascii"),
    Buffer.alloc(2),
    u32(0xffffffff),
    tag(0xfffe, 0xe000),
    u32(0),
    tag(0xfffe, 0xe000),
    u32(even.length),
    even,
    tag(0xfffe, 0xe0dd),
    u32(0),
  ]);
}

export const TRANSFER_JPEG_BASELINE = "1.2.840.10008.1.2.4.50";
export const SOP_US_MULTIFRAME = "1.2.840.10008.5.1.4.1.1.3.1";

export type MiniUsCineOptions = {
  /** Each entry is one complete JPEG fragment (starts with FF D8). */
  frames: Uint8Array[];
  rows?: number;
  columns?: number;
  instanceNumber?: number;
  /** 3 for color (YBR_FULL_422, the reference scanner's format) or 1 for mono. */
  samplesPerPixel?: number;
  photometric?: string;
  /** (0018,0040) CineRate, in fps. */
  frameRate?: number;
  /** (0018,1063) FrameTime, in ms — an alternative to frameRate. */
  frameTime?: number;
  /**
   * Write a zero-length Basic Offset Table item instead of one offset per
   * frame. Legal (DICOM PS3.5 A.4) and common on real scanners; readers have
   * to find the frames themselves. See `multiFrameSourceFromPart10`.
   */
  emptyBasicOffsetTable?: boolean;
  /**
   * Split each frame across this many fragment items (default 1). Only the
   * first fragment of a frame starts with the JPEG SOI marker, so a reader
   * indexing an empty Basic Offset Table has to concatenate the rest.
   */
  fragmentsPerFrame?: number;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
};

/**
 * Builds an encapsulated JPEG Baseline multi-frame Ultrasound object: a
 * Basic Offset Table item and one fragment item per frame in `frames`. By
 * default the table holds one offset per frame, as
 * `dicomParser.readEncapsulatedImageFrame` expects; `emptyBasicOffsetTable`
 * and `fragmentsPerFrame` build the shapes a reader has to index itself. See
 * plan 06 (echo cine loops) and shared/dicom-frame.ts's
 * `multiFrameSourceFromPart10`.
 */
export function buildMiniUsCine(options: MiniUsCineOptions): Buffer {
  const rows = options.rows ?? 8;
  const columns = options.columns ?? 8;
  const instanceNumber = options.instanceNumber ?? 1;
  const samplesPerPixel = options.samplesPerPixel ?? 3;
  const photometric =
    options.photometric ?? (samplesPerPixel === 3 ? "YBR_FULL_422" : "MONOCHROME2");
  const sopInstance = `1.2.826.0.1.3680043.8.498.us.${instanceNumber}`;
  const sopClass = SOP_US_MULTIFRAME;
  const studyInstanceUid = options.studyInstanceUid ?? "1.2.826.0.1.3680043.8.498.study.us";
  const seriesInstanceUid = options.seriesInstanceUid ?? "1.2.826.0.1.3680043.8.498.series.us";

  const metaWithoutLength = Buffer.concat([
    explicitElement(0x0002, 0x0001, "OB", Buffer.from([0x00, 0x01])),
    explicitElement(0x0002, 0x0002, "UI", ui(sopClass)),
    explicitElement(0x0002, 0x0003, "UI", ui(sopInstance)),
    explicitElement(0x0002, 0x0010, "UI", ui(TRANSFER_JPEG_BASELINE)),
    explicitElement(0x0002, 0x0012, "UI", ui("1.2.826.0.1.3680043.8.498.1")),
  ]);
  const fileMeta = Buffer.concat([
    explicitElement(0x0002, 0x0000, "UL", u32(metaWithoutLength.length)),
    metaWithoutLength,
  ]);

  const pixelBytes = encapsulatedMultiFramePixelData(
    options.frames.map((frame) => Buffer.from(frame)),
    options.emptyBasicOffsetTable ?? false,
    options.fragmentsPerFrame ?? 1,
  );

  const dataset = Buffer.concat([
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs("US")),
    ...(options.frameRate != null
      ? [explicitElement(0x0018, 0x0040, "IS", ds(options.frameRate))]
      : []),
    ...(options.frameTime != null
      ? [explicitElement(0x0018, 0x1063, "DS", ds(options.frameTime))]
      : []),
    explicitElement(0x0020, 0x000d, "UI", ui(studyInstanceUid)),
    explicitElement(0x0020, 0x000e, "UI", ui(seriesInstanceUid)),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    explicitElement(0x0028, 0x0002, "US", us(samplesPerPixel)),
    explicitElement(0x0028, 0x0004, "CS", cs(photometric)),
    explicitElement(0x0028, 0x0008, "IS", is(options.frames.length)),
    explicitElement(0x0028, 0x0010, "US", us(rows)),
    explicitElement(0x0028, 0x0011, "US", us(columns)),
    explicitElement(0x0028, 0x0100, "US", us(8)),
    explicitElement(0x0028, 0x0101, "US", us(8)),
    explicitElement(0x0028, 0x0102, "US", us(7)),
    explicitElement(0x0028, 0x0103, "US", us(0)),
    pixelBytes,
  ]);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

/**
 * Encapsulated pixel data for a multi-frame object: a Basic Offset Table
 * item followed by fragment items. With `emptyBasicOffsetTable` the table
 * item is written zero-length — legal per DICOM PS3.5 A.4, and the case
 * `dicomParser.readEncapsulatedImageFrame` throws for — otherwise it holds
 * one offset per frame. `fragmentsPerFrame` splits each frame across
 * several fragments, so only its first fragment starts with FF D8.
 */
function encapsulatedMultiFramePixelData(
  frames: Buffer[],
  emptyBasicOffsetTable: boolean,
  fragmentsPerFrame: number,
): Buffer {
  const padded = frames.map((frame) =>
    frame.length % 2 === 0 ? frame : Buffer.concat([frame, Buffer.from([0x00])]),
  );
  const items = padded.map((frame) => splitIntoFragments(frame, fragmentsPerFrame));

  const offsets: number[] = [];
  let running = 0;
  for (const fragments of items) {
    offsets.push(running);
    for (const fragment of fragments) {
      running += 8 + fragment.length; // item tag (4) + item length (4) + data
    }
  }
  const basicOffsetTable = emptyBasicOffsetTable
    ? Buffer.alloc(0)
    : Buffer.alloc(offsets.length * 4);
  if (!emptyBasicOffsetTable) {
    offsets.forEach((offset, i) => basicOffsetTable.writeUInt32LE(offset, i * 4));
  }

  return Buffer.concat([
    tag(0x7fe0, 0x0010),
    Buffer.from("OB", "ascii"),
    Buffer.alloc(2),
    u32(0xffffffff),
    tag(0xfffe, 0xe000),
    u32(basicOffsetTable.length),
    basicOffsetTable,
    ...items.flat().flatMap((fragment) => [
      tag(0xfffe, 0xe000),
      u32(fragment.length),
      fragment,
    ]),
    tag(0xfffe, 0xe0dd),
    u32(0),
  ]);
}

/**
 * Cuts one frame into `count` fragments of even length. Every fragment after
 * the first must start mid-stream (never with FF D8), or a reader walking an
 * empty Basic Offset Table would read it as a new frame — so this refuses to
 * build a fixture that lies about its own frame boundaries.
 */
function splitIntoFragments(frame: Buffer, count: number): Buffer[] {
  if (count <= 1) {
    return [frame];
  }
  const size = Math.max(2, (Math.floor(frame.length / count) >> 1) << 1);
  const fragments: Buffer[] = [];
  for (let start = 0; start < frame.length; start += size) {
    const end = fragments.length === count - 1 ? frame.length : Math.min(start + size, frame.length);
    fragments.push(frame.subarray(start, end));
    if (end === frame.length) {
      break;
    }
  }
  for (const fragment of fragments.slice(1)) {
    if (fragment[0] === 0xff && fragment[1] === 0xd8) {
      throw new Error("continuation fragment starts with FF D8; pick another split");
    }
    if (fragment.length % 2 !== 0) {
      throw new Error("fragments must have even length");
    }
  }
  return fragments;
}

export type MiniScRgbOptions = {
  rows?: number;
  columns?: number;
  instanceNumber?: number;
  pixels?: Uint8Array;
  transferSyntax?: typeof TRANSFER_EXPLICIT_LE | typeof TRANSFER_RLE;
};

export function buildMiniScRgbDicom(options: MiniScRgbOptions = {}): Buffer {
  const rows = options.rows ?? 8;
  const columns = options.columns ?? 8;
  const instanceNumber = options.instanceNumber ?? 1;
  const transferSyntax = options.transferSyntax ?? TRANSFER_RLE;
  const pixels = options.pixels ?? defaultScRgbPixels(rows, columns);
  if (pixels.length < rows * columns * 3) {
    throw new Error("SC RGB pixels must be interleaved RGB");
  }

  const sopInstance = `1.2.826.0.1.3680043.8.498.sc.${instanceNumber}`;
  const sopClass = SOP_SECONDARY_CAPTURE;

  const metaWithoutLength = Buffer.concat([
    explicitElement(0x0002, 0x0001, "OB", Buffer.from([0x00, 0x01])),
    explicitElement(0x0002, 0x0002, "UI", ui(sopClass)),
    explicitElement(0x0002, 0x0003, "UI", ui(sopInstance)),
    explicitElement(0x0002, 0x0010, "UI", ui(transferSyntax)),
    explicitElement(0x0002, 0x0012, "UI", ui("1.2.826.0.1.3680043.8.498.1")),
  ]);
  const fileMeta = Buffer.concat([
    explicitElement(0x0002, 0x0000, "UL", u32(metaWithoutLength.length)),
    metaWithoutLength,
  ]);

  const rgb = pixels.subarray(0, rows * columns * 3);
  const pixelBytes =
    transferSyntax === TRANSFER_RLE
      ? encapsulatedPixelData(encodeRlePlanes(rgbPlanes(rgb, rows * columns)))
      : explicitElement(0x7fe0, 0x0010, "OB", Buffer.from(rgb));

  const dataset = Buffer.concat([
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs("OT")),
    explicitElement(0x0020, 0x000d, "UI", ui("1.2.826.0.1.3680043.8.498.study.1")),
    explicitElement(0x0020, 0x000e, "UI", ui("1.2.826.0.1.3680043.8.498.series.sc")),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    explicitElement(0x0028, 0x0002, "US", us(3)),
    explicitElement(0x0028, 0x0004, "CS", cs("RGB")),
    explicitElement(0x0028, 0x0006, "US", us(transferSyntax === TRANSFER_RLE ? 1 : 0)),
    explicitElement(0x0028, 0x0010, "US", us(rows)),
    explicitElement(0x0028, 0x0011, "US", us(columns)),
    explicitElement(0x0028, 0x0100, "US", us(8)),
    explicitElement(0x0028, 0x0101, "US", us(8)),
    explicitElement(0x0028, 0x0102, "US", us(7)),
    explicitElement(0x0028, 0x0103, "US", us(0)),
    pixelBytes,
  ]);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

function defaultScRgbPixels(rows: number, columns: number): Uint8Array {
  const pixels = new Uint8Array(rows * columns * 3);
  pixels[0] = 255;
  pixels[4] = 255;
  pixels[8] = 255;
  for (let i = 3; i < rows * columns; i++) {
    const offset = i * 3;
    pixels[offset] = 32;
    pixels[offset + 1] = 64;
    pixels[offset + 2] = 96;
  }
  return pixels;
}

function rgbPlanes(rgb: Uint8Array, sampleCount: number): Uint8Array[] {
  const red = new Uint8Array(sampleCount);
  const green = new Uint8Array(sampleCount);
  const blue = new Uint8Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    red[i] = rgb[i * 3];
    green[i] = rgb[i * 3 + 1];
    blue[i] = rgb[i * 3 + 2];
  }
  return [red, green, blue];
}

function encodeRle(pixels: Uint16Array): Buffer {
  const high = new Uint8Array(pixels.length);
  const low = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    high[i] = (pixels[i] >> 8) & 0xff;
    low[i] = pixels[i] & 0xff;
  }
  return encodeRlePlanes([high, low]);
}

function encodeRlePlanes(planes: Uint8Array[]): Buffer {
  const encoded = planes.map((plane) => rlePlane(Buffer.from(plane)));
  const header = Buffer.alloc(64);
  header.writeUInt32LE(planes.length, 0);
  let offset = 64;
  for (let i = 0; i < planes.length; i++) {
    header.writeUInt32LE(offset, 4 + i * 4);
    offset += encoded[i].length;
  }
  return Buffer.concat([header, ...encoded]);
}

function rlePlane(plane: Buffer): Buffer {
  const out: number[] = [];
  for (let i = 0; i < plane.length; ) {
    const n = Math.min(128, plane.length - i);
    out.push(n - 1);
    for (let j = 0; j < n; j++) {
      out.push(plane[i + j]);
    }
    i += n;
  }
  return Buffer.from(out);
}

function encodeJpegLossless(
  pixels: Uint16Array,
  rows: number,
  columns: number,
): Buffer {
  const sof = Buffer.from([
    0xff, 0xc3, 0x00, 0x0b, 0x10, (rows >> 8) & 0xff, rows & 0xff,
    (columns >> 8) & 0xff, columns & 0xff, 0x01, 0x01, 0x11, 0x00,
  ]);
  const dhtCounts = Buffer.from([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x11, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  const dhtSymbols = Buffer.from(Array.from({ length: 17 }, (_, i) => i));
  const dht = Buffer.concat([
    Buffer.from([0xff, 0xc4, 0x00, 0x24, 0x00]),
    dhtCounts,
    dhtSymbols,
  ]);
  const sos = Buffer.from([
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const scan = jpegLosslessScan(pixels, rows, columns);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    sof,
    dht,
    sos,
    scan,
    Buffer.from([0xff, 0xd9]),
  ]);
}

function jpegLosslessScan(
  pixels: Uint16Array,
  rows: number,
  columns: number,
): Buffer {
  const writer = new JpegBitWriter();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const predicted =
        x === 0 && y === 0
          ? 1 << 15
          : x === 0
            ? pixels[(y - 1) * columns]
            : pixels[y * columns + x - 1];
      const diff = (pixels[y * columns + x] - predicted) | 0;
      const { category, extra } = jpegDiff(diff);
      writer.write(category, 8);
      if (category > 0) {
        writer.write(extra, category);
      }
    }
  }
  return writer.finish();
}

function jpegDiff(diff: number): { category: number; extra: number } {
  if (diff === 0) {
    return { category: 0, extra: 0 };
  }
  let category = 0;
  let value = Math.abs(diff);
  while (value > 0) {
    value >>= 1;
    category += 1;
  }
  const extra =
    diff > 0 ? diff : (diff - 1) & ((1 << category) - 1);
  return { category, extra };
}

class JpegBitWriter {
  private bits = 0;
  private n = 0;
  private readonly out: number[] = [];

  write(code: number, length: number) {
    this.bits = (this.bits << length) | code;
    this.n += length;
    while (this.n >= 8) {
      const byte = (this.bits >> (this.n - 8)) & 0xff;
      this.out.push(byte);
      if (byte === 0xff) {
        this.out.push(0x00);
      }
      this.n -= 8;
      this.bits &= this.n === 0 ? 0 : (1 << this.n) - 1;
    }
  }

  finish(): Buffer {
    if (this.n > 0) {
      const byte = ((this.bits << (8 - this.n)) | ((1 << (8 - this.n)) - 1)) & 0xff;
      this.out.push(byte);
      if (byte === 0xff) {
        this.out.push(0x00);
      }
    }
    return Buffer.from(this.out);
  }
}

/** One node of a Structured Report content tree, as given to buildMiniSr. */
export type MiniSrNode = {
  type: string;
  name?: string;
  text?: string;
  value?: number;
  unit?: string;
  code?: string;
  imageRef?: string;
  children?: MiniSrNode[];
};

export type MiniSrOptions = {
  title: string;
  nodes: MiniSrNode[];
  sopClass?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  instanceNumber?: number;
};

/** Wraps one item's dataset bytes with the (FFFE,E000) item tag and a defined length. */
function sqItem(datasetBytes: Buffer): Buffer {
  return Buffer.concat([tag(0xfffe, 0xe000), u32(datasetBytes.length), datasetBytes]);
}

/** A defined-length SQ element containing `items`, each one item's dataset bytes. */
function sq(group: number, element: number, items: Buffer[]): Buffer {
  return explicitElement(
    group,
    element,
    "SQ",
    Buffer.concat(items.map(sqItem)),
  );
}

/** ConceptNameCodeSequence (0040,A043), one item carrying only CodeMeaning (0008,0104). */
function conceptNameCodeSequence(meaning: string): Buffer {
  return sq(0x0040, 0xa043, [explicitElement(0x0008, 0x0104, "LO", cs(meaning))]);
}

/** One SR content item's dataset bytes: ValueType, name, value, and nested ContentSequence. */
function contentItem(node: MiniSrNode): Buffer {
  const parts: Buffer[] = [explicitElement(0x0040, 0xa040, "CS", cs(node.type))];
  if (node.name) {
    parts.push(conceptNameCodeSequence(node.name));
  }
  if (node.type === "TEXT" && node.text != null) {
    parts.push(
      explicitElement(0x0040, 0xa160, "UT", padEven(Buffer.from(node.text, "ascii"))),
    );
  }
  if (node.type === "NUM" && node.value != null) {
    const measuredItem: Buffer[] = [explicitElement(0x0040, 0xa30a, "DS", ds(node.value))];
    if (node.unit) {
      measuredItem.push(
        sq(0x0040, 0x08ea, [explicitElement(0x0008, 0x0100, "SH", cs(node.unit))]),
      );
    }
    parts.push(sq(0x0040, 0xa300, [Buffer.concat(measuredItem)]));
  }
  if (node.type === "CODE" && node.code) {
    parts.push(sq(0x0040, 0xa168, [explicitElement(0x0008, 0x0104, "LO", cs(node.code))]));
  }
  if (node.type === "IMAGE" && node.imageRef) {
    parts.push(sq(0x0008, 0x1199, [explicitElement(0x0008, 0x1155, "UI", ui(node.imageRef))]));
  }
  if (node.children && node.children.length > 0) {
    parts.push(sq(0x0040, 0xa730, node.children.map(contentItem)));
  }
  return Buffer.concat(parts);
}

/**
 * Builds a Structured Report file: no pixel data, explicit VR little-endian,
 * a root content item (title) whose ContentSequence holds `nodes`. Sequences
 * use defined lengths throughout, matching what the reference scanner writes.
 */
export function buildMiniSr(options: MiniSrOptions): Buffer {
  const sopClass = options.sopClass ?? SOP_COMPREHENSIVE_SR;
  const instanceNumber = options.instanceNumber ?? 1;
  const sopInstance = `1.2.826.0.1.3680043.8.498.sr.${instanceNumber}`;
  const transferSyntax = TRANSFER_EXPLICIT_LE;

  const metaWithoutLength = Buffer.concat([
    explicitElement(0x0002, 0x0001, "OB", Buffer.from([0x00, 0x01])),
    explicitElement(0x0002, 0x0002, "UI", ui(sopClass)),
    explicitElement(0x0002, 0x0003, "UI", ui(sopInstance)),
    explicitElement(0x0002, 0x0010, "UI", ui(transferSyntax)),
    explicitElement(0x0002, 0x0012, "UI", ui("1.2.826.0.1.3680043.8.498.1")),
  ]);
  const fileMeta = Buffer.concat([
    explicitElement(0x0002, 0x0000, "UL", u32(metaWithoutLength.length)),
    metaWithoutLength,
  ]);

  const studyInstanceUid =
    options.studyInstanceUid ?? "1.2.826.0.1.3680043.8.498.study.1";
  const seriesInstanceUid =
    options.seriesInstanceUid ?? "1.2.826.0.1.3680043.8.498.series.sr";

  const parts: Buffer[] = [
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs("SR")),
    explicitElement(0x0020, 0x000d, "UI", ui(studyInstanceUid)),
    explicitElement(0x0020, 0x000e, "UI", ui(seriesInstanceUid)),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    explicitElement(0x0040, 0xa040, "CS", cs("CONTAINER")),
    conceptNameCodeSequence(options.title),
  ];
  if (options.nodes.length > 0) {
    parts.push(sq(0x0040, 0xa730, options.nodes.map(contentItem)));
  }
  const dataset = Buffer.concat(parts);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

