import dicomParser from "dicom-parser";

const PREAMBLE = 128;

const UNCOMPRESSED = new Set([
  "1.2.840.10008.1.2",
  "1.2.840.10008.1.2.1",
  "1.2.840.10008.1.2.2",
]);

export type DicomFrame = {
  rows: number;
  columns: number;
  pixels: Uint16Array;
  windowCenter: number;
  windowWidth: number;
};

export function pixelFrameFromPart10(bytes: Uint8Array): DicomFrame | null {
  if (bytes.length < PREAMBLE + 4) {
    return null;
  }
  const magic = String.fromCharCode(
    bytes[PREAMBLE],
    bytes[PREAMBLE + 1],
    bytes[PREAMBLE + 2],
    bytes[PREAMBLE + 3],
  );
  if (magic !== "DICM") {
    return null;
  }

  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const transfer = dataSet.string("x00020010") ?? "1.2.840.10008.1.2";
    if (!UNCOMPRESSED.has(transfer)) {
      return null;
    }
    const rows = dataSet.uint16("x00280010");
    const columns = dataSet.uint16("x00280011");
    const bitsAllocated = dataSet.uint16("x00280100") ?? 16;
    const pixelElement = dataSet.elements.x7fe00010;
    if (!rows || !columns || !pixelElement || bitsAllocated !== 16) {
      return null;
    }
    const raw = bytes.subarray(
      pixelElement.dataOffset,
      pixelElement.dataOffset + pixelElement.length,
    );
    const pixels = new Uint16Array(
      raw.buffer,
      raw.byteOffset,
      raw.byteLength / 2,
    );
    if (pixels.length < rows * columns) {
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
