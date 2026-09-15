import { describe, expect, it } from "vitest";
import type { PublicDocument, StudySummary } from "@/lib/sdk";
import { sharedFileHref, sharedReportHref, standaloneDocuments } from "./share-portal";

function doc(id: number, overrides: Partial<PublicDocument> = {}): PublicDocument {
  return {
    id,
    title: `Record ${id}`,
    documentType: "other",
    fileName: `${id}.bin`,
    filePath: undefined as never,
    fileSize: 1,
    mimeType: "application/octet-stream",
    fileCount: 1,
    documentDate: null,
    doctorName: null,
    facilityName: null,
    notes: null,
    tags: null,
    dicomMeta: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as PublicDocument;
}

function study(records: PublicDocument[]): StudySummary {
  return {
    studyInstanceUid: "1.2.3",
    studyDescription: "Coronary CTA",
    documentDate: "2026-03-18",
    modalities: ["CT"],
    seriesCount: records.length,
    fileCount: records.length,
    primary: records[0] ?? null,
    groups: { primary: records.slice(0, 1), supplementary: records.slice(1), reports: [] },
    primaryPhases: null,
  } as unknown as StudySummary;
}

describe("share portal helpers", () => {
  it("builds token-scoped file and report links", () => {
    expect(sharedFileHref("a b", 7)).toBe("/api/s/a%20b/files/7");
    expect(sharedReportHref("tok")(9)).toBe("/s/tok/reports/9");
  });

  it("lists only the documents no study already shows", () => {
    const ct = doc(1, { dicomMeta: { modality: "CT" } as never });
    const sr = doc(2, { dicomMeta: { modality: "SR" } as never });
    const pdf = doc(3, { mimeType: "application/pdf" });
    const result = standaloneDocuments({ documents: [ct, sr, pdf], studies: [study([ct, sr])] });
    expect(result.map((d) => d.id)).toEqual([3]);
  });

  it("shows every document when nothing groups into a study", () => {
    const docs = [doc(1), doc(2)];
    expect(standaloneDocuments({ documents: docs, studies: [] })).toEqual(docs);
  });
});
