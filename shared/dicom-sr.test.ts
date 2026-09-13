import { describe, expect, it } from "vitest";
import { flattenMeasurements, parseSr } from "./dicom-sr";
import {
  SOP_BASIC_TEXT_SR,
  buildMiniCtDicom,
  buildMiniSr,
} from "./mini-ct-dicom";

describe("parseSr", () => {
  it("returns null for a non-SR fixture", () => {
    const bytes = buildMiniCtDicom({});
    expect(parseSr(new Uint8Array(bytes))).toBeNull();
  });

  it("returns an empty node list for an SR with no content", () => {
    const bytes = buildMiniSr({ title: "Radiology Report", nodes: [] });
    const report = parseSr(new Uint8Array(bytes));
    expect(report).toEqual({ title: "Radiology Report", nodes: [] });
  });

  it("reads the document title from a Basic Text SR too", () => {
    const bytes = buildMiniSr({
      title: "Radiology Report",
      nodes: [],
      sopClass: SOP_BASIC_TEXT_SR,
    });
    const report = parseSr(new Uint8Array(bytes));
    expect(report?.title).toBe("Radiology Report");
  });

  it("parses a nested container into a matching node tree", () => {
    const bytes = buildMiniSr({
      title: "CT Coronary",
      nodes: [
        {
          type: "CONTAINER",
          name: "LAD",
          children: [
            { type: "TEXT", name: "Identifier", text: "LAD proximal" },
            { type: "NUM", name: "Length", value: 12.4, unit: "cm" },
            { type: "IMAGE", name: "Evidence", imageRef: "1.2.3.4.999" },
          ],
        },
      ],
    });

    const report = parseSr(new Uint8Array(bytes));

    expect(report?.title).toBe("CT Coronary");
    expect(report?.nodes).toEqual([
      {
        type: "CONTAINER",
        name: "LAD",
        children: [
          {
            type: "TEXT",
            name: "Identifier",
            text: "LAD proximal",
            children: [],
          },
          {
            type: "NUM",
            name: "Length",
            value: 12.4,
            unit: "cm",
            children: [],
          },
          {
            type: "IMAGE",
            name: "Evidence",
            imageRef: "1.2.3.4.999",
            children: [],
          },
        ],
      },
    ]);
  });

  it("reads a CODE item's ConceptCodeSequence CodeMeaning", () => {
    const bytes = buildMiniSr({
      title: "CT Coronary",
      nodes: [{ type: "CODE", name: "Finding type", code: "Stenosis" }],
    });

    const report = parseSr(new Uint8Array(bytes));

    expect(report?.nodes[0]).toMatchObject({ type: "CODE", code: "Stenosis" });
  });
});

describe("flattenMeasurements", () => {
  it("flattens a nested container into a breadcrumb path with the sibling image ref", () => {
    const bytes = buildMiniSr({
      title: "CT Coronary",
      nodes: [
        {
          type: "CONTAINER",
          name: "LAD",
          children: [
            { type: "TEXT", name: "Identifier", text: "LAD proximal" },
            { type: "NUM", name: "Length", value: 12.4, unit: "cm" },
            { type: "IMAGE", name: "Evidence", imageRef: "1.2.3.4.999" },
          ],
        },
      ],
    });
    const report = parseSr(new Uint8Array(bytes))!;

    expect(flattenMeasurements(report.nodes)).toEqual([
      {
        path: ["LAD"],
        name: "Length",
        value: 12.4,
        unit: "cm",
        imageRef: "1.2.3.4.999",
      },
    ]);
  });

  it("flattens multiple nested containers, one measurement each", () => {
    const bytes = buildMiniSr({
      title: "CT Coronary",
      nodes: [
        {
          type: "CONTAINER",
          name: "LAD",
          children: [{ type: "NUM", name: "Length", value: 12.4, unit: "cm" }],
        },
        {
          type: "CONTAINER",
          name: "RCA",
          children: [{ type: "NUM", name: "Length", value: 8.1, unit: "cm" }],
        },
      ],
    });
    const report = parseSr(new Uint8Array(bytes))!;

    expect(flattenMeasurements(report.nodes)).toEqual([
      { path: ["LAD"], name: "Length", value: 12.4, unit: "cm", imageRef: undefined },
      { path: ["RCA"], name: "Length", value: 8.1, unit: "cm", imageRef: undefined },
    ]);
  });

  it("returns nothing for a report with no NUM items", () => {
    const bytes = buildMiniSr({
      title: "Radiology Report",
      nodes: [{ type: "TEXT", name: "Findings", text: "" }],
    });
    const report = parseSr(new Uint8Array(bytes))!;

    expect(flattenMeasurements(report.nodes)).toEqual([]);
  });
});
