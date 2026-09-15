declare module "dicom-parser" {
  export type Fragment = {
    offset: number;
    position: number;
    length: number;
  };

  export type Element = {
    dataOffset: number;
    length: number;
    encapsulatedPixelData?: boolean;
    basicOffsetTable?: number[];
    fragments?: Fragment[];
    /** Present for a Sequence (SQ) element: one entry per item, each with its own nested DataSet (undefined for an item dicom-parser couldn't parse). */
    items?: { dataSet?: DataSet }[];
  };

  export type DataSet = {
    string(tag: string): string | undefined;
    uint16(tag: string): number | undefined;
    elements: Record<string, Element>;
  };

  export function parseDicom(
    data: Uint8Array,
    options?: { untilTag?: string },
  ): DataSet;
  export function readEncapsulatedImageFrame(
    dataSet: DataSet,
    pixelDataElement: Element,
    frameIndex: number,
  ): Uint8Array;
  export function readEncapsulatedPixelDataFromFragments(
    dataSet: DataSet,
    pixelDataElement: Element,
    startFragmentIndex: number,
    numFragments?: number,
  ): Uint8Array;

  const dicomParser: {
    parseDicom: typeof parseDicom;
    readEncapsulatedImageFrame: typeof readEncapsulatedImageFrame;
    readEncapsulatedPixelDataFromFragments: typeof readEncapsulatedPixelDataFromFragments;
  };
  export default dicomParser;
}
