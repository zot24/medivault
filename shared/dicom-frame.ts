import dicomParser from "dicom-parser";
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

export type DicomFrame = {
  rows: number;
  columns: number;
  pixels: Uint16Array;
  windowCenter: number;
  windowWidth: number;
};

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
    const pixelElement = dataSet.elements.x7fe00010;
    if (!rows || !columns || !pixelElement || bitsAllocated !== 16) {
      return null;
    }

    const pixels = decodePixels(transfer, {
      bytes,
      dataSet,
      pixelElement,
      rows,
      columns,
    });
    if (!pixels || pixels.length < rows * columns) {
      return null;
    }

    const windowCenter = Number(dataSet.string("x00281050") ?? "500");
    const windowWidth = Number(dataSet.string("x00281051") ?? "1000");
    return {
      rows,
      columns,
      pixels: pixels.subarray(0, rows * columns),
      windowCenter: Number.isFinite(windowCenter) ? windowCenter : 500,
      windowWidth: Number.isFinite(windowWidth) ? windowWidth : 1000,
    };
  } catch {
    return null;
  }
}

type ParsedDicom = ReturnType<typeof dicomParser.parseDicom>;
type PixelElement = ParsedDicom["elements"][string];

function decodePixels(
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
    return decodeUncompressed(input.bytes, input.pixelElement);
  }
  if (JPEG_LOSSLESS.has(transfer)) {
    return decodeJpegLossless(input.dataSet, input.pixelElement);
  }
  if (transfer === RLE) {
    return decodeRle(input.dataSet, input.pixelElement, input.rows * input.columns);
  }
  return null;
}

function decodeUncompressed(
  bytes: Uint8Array,
  pixelElement: { dataOffset: number; length: number },
): Uint16Array | null {
  const raw = bytes.subarray(
    pixelElement.dataOffset,
    pixelElement.dataOffset + pixelElement.length,
  );
  return new Uint16Array(raw.buffer, raw.byteOffset, raw.byteLength / 2);
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

function decodeRle(
  dataSet: ParsedDicom,
  pixelElement: PixelElement,
  sampleCount: number,
): Uint16Array | null {
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
  if (segments < 2) {
    return null;
  }
  const high = decodeRleSegment(
    fragment,
    view.getUint32(4, true),
    segmentEnd(view, 1, segments, fragment.byteLength),
    sampleCount,
  );
  const low = decodeRleSegment(
    fragment,
    view.getUint32(8, true),
    segmentEnd(view, 2, segments, fragment.byteLength),
    sampleCount,
  );
  if (!high || !low) {
    return null;
  }
  const pixels = new Uint16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    pixels[i] = (high[i] << 8) | low[i];
  }
  return pixels;
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
