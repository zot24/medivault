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
  /** DS text as written to the file; multi-valued like "345\\-600" is allowed. */
  windowCenter?: number | string;
  windowWidth?: number | string;
  rescaleIntercept?: number;
  rescaleSlope?: number;
  /** A single graphics overlay plane at group (6000,eeee). */
  overlay?: MiniCtOverlay;
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

  const pixelBytes =
    transferSyntax === TRANSFER_JPEG_LOSSLESS
      ? encapsulatedPixelData(encodeJpegLossless(pixels, rows, columns))
      : transferSyntax === TRANSFER_RLE
        ? encapsulatedPixelData(encodeRle(pixels))
        : explicitElement(
            0x7fe0,
            0x0010,
            "OW",
            Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength),
          );

  const dataset = Buffer.concat([
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs("CT")),
    explicitElement(0x0020, 0x000d, "UI", ui("1.2.826.0.1.3680043.8.498.study.1")),
    explicitElement(0x0020, 0x000e, "UI", ui("1.2.826.0.1.3680043.8.498.series.1")),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    explicitElement(0x0028, 0x0002, "US", us(samplesPerPixel)),
    explicitElement(0x0028, 0x0004, "CS", cs(photometric)),
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
    ...(options.overlay ? [overlayElements(options.overlay)] : []),
    pixelBytes,
  ]);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

/** Emits the six elements of one graphics overlay plane at group (6000,eeee). */
function overlayElements(overlay: MiniCtOverlay, group = 0x6000): Buffer {
  const originRow = overlay.originRow ?? 1;
  const originColumn = overlay.originColumn ?? 1;
  return Buffer.concat([
    explicitElement(group, 0x0010, "US", us(overlay.rows)),
    explicitElement(group, 0x0011, "US", us(overlay.columns)),
    explicitElement(group, 0x0040, "CS", cs("G")),
    explicitElement(group, 0x0050, "SS", ss([originRow, originColumn])),
    explicitElement(group, 0x0100, "US", us(1)),
    explicitElement(group, 0x0102, "US", us(0)),
    explicitElement(group, 0x3000, "OW", packOverlayBits(overlay.pixels)),
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

