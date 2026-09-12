declare module "jpeg-lossless-decoder-js" {
  export class Decoder {
    decode(
      buffer: ArrayBuffer,
      offset?: number,
      length?: number,
    ): Uint8Array | Uint16Array | null;
  }
}
