declare module "dicom-parser" {
  export type DataSet = {
    string(tag: string): string | undefined;
    uint16(tag: string): number | undefined;
    elements: Record<string, { dataOffset: number; length: number }>;
  };

  export function parseDicom(data: Uint8Array): DataSet;

  const dicomParser: { parseDicom: typeof parseDicom };
  export default dicomParser;
}
