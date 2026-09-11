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

function ds(value: number): Buffer {
  return padEven(Buffer.from(String(value), "ascii"));
}

function us(value: number): Buffer {
  return u16(value);
}

export type MiniCtOptions = {
  rows?: number;
  columns?: number;
  instanceNumber?: number;
  pixels?: Uint16Array;
};

export function buildMiniCtDicom(options: MiniCtOptions = {}): Buffer {
  const rows = options.rows ?? 16;
  const columns = options.columns ?? 16;
  const instanceNumber = options.instanceNumber ?? 1;
  const pixels =
    options.pixels ??
    Uint16Array.from({ length: rows * columns }, (_, i) =>
      Math.round((i / (rows * columns - 1)) * 1000),
    );

  const sopInstance = `1.2.826.0.1.3680043.8.498.spike.${instanceNumber}`;
  const transferSyntax = "1.2.840.10008.1.2.1";
  const sopClass = "1.2.840.10008.5.1.4.1.1.2";

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

  const pixelBytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);

  const dataset = Buffer.concat([
    explicitElement(0x0008, 0x0016, "UI", ui(sopClass)),
    explicitElement(0x0008, 0x0018, "UI", ui(sopInstance)),
    explicitElement(0x0008, 0x0060, "CS", cs("CT")),
    explicitElement(0x0020, 0x000d, "UI", ui("1.2.826.0.1.3680043.8.498.study.1")),
    explicitElement(0x0020, 0x000e, "UI", ui("1.2.826.0.1.3680043.8.498.series.1")),
    explicitElement(0x0020, 0x0013, "IS", is(instanceNumber)),
    explicitElement(0x0028, 0x0002, "US", us(1)),
    explicitElement(0x0028, 0x0004, "CS", cs("MONOCHROME2")),
    explicitElement(0x0028, 0x0010, "US", us(rows)),
    explicitElement(0x0028, 0x0011, "US", us(columns)),
    explicitElement(0x0028, 0x0100, "US", us(16)),
    explicitElement(0x0028, 0x0101, "US", us(16)),
    explicitElement(0x0028, 0x0102, "US", us(15)),
    explicitElement(0x0028, 0x0103, "US", us(0)),
    explicitElement(0x0028, 0x1050, "DS", ds(500)),
    explicitElement(0x0028, 0x1051, "DS", ds(1000)),
    explicitElement(0x7fe0, 0x0010, "OW", pixelBytes),
  ]);

  return Buffer.concat([Buffer.alloc(PREAMBLE), DICM, fileMeta, dataset]);
}

