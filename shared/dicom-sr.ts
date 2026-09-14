import dicomParser, { type DataSet } from "dicom-parser";
import { isPart10 } from "./upload-kinds";

/**
 * One node of a DICOM Structured Report content tree. Carries only what the
 * summary view renders — no patient, physician, institution, or date tags;
 * this module only ever walks ContentSequence (0040,A730).
 */
export type SrNode = {
  type: string;
  name: string;
  text?: string;
  value?: number;
  unit?: string;
  code?: string;
  imageRef?: string;
  children: SrNode[];
};

export type SrMeasurement = {
  path: string[];
  name: string;
  value: number;
  unit: string;
  imageRef?: string;
  /**
   * The sibling TEXT identifier's text, when the measurement's parent
   * container has one (e.g. the reference disc's CT Coronary report names
   * each lesion in a TEXT item next to the NUM). Meant to be shown as the
   * row's primary text, with `path` as secondary context — every row's
   * breadcrumb otherwise ends in the same container name (e.g. "Lesion
   * Finding") and never distinguishes them.
   */
  label?: string;
};

/** SR SOP classes are 1.2.840.10008.5.1.4.1.1.88.* (Basic Text, Comprehensive, ...). */
const SR_SOP_CLASS_PREFIX = "1.2.840.10008.5.1.4.1.1.88.";

/**
 * Parses a Structured Report's content tree. Returns null when the file
 * isn't Part-10 or isn't an SR SOP class — never throws on a malformed or
 * vendor-private tree, since most SRs on the reference disc are empty or
 * private and should degrade to "no readable content" rather than error.
 */
export function parseSr(bytes: Uint8Array): { title: string; nodes: SrNode[] } | null {
  if (!isPart10(bytes)) {
    return null;
  }
  try {
    const dataSet = dicomParser.parseDicom(bytes);
    const sopClassUid = dataSet.string("x00080016") ?? "";
    if (!sopClassUid.startsWith(SR_SOP_CLASS_PREFIX)) {
      return null;
    }
    return {
      title: codeMeaning(dataSet, "x0040a043") ?? "",
      nodes: sequenceItems(dataSet, "x0040a730").map(parseContentItem),
    };
  } catch {
    return null;
  }
}

function parseContentItem(dataSet: DataSet): SrNode {
  const type = trimmed(dataSet.string("x0040a040") ?? "");
  const node: SrNode = {
    type,
    name: codeMeaning(dataSet, "x0040a043") ?? "",
    children: sequenceItems(dataSet, "x0040a730").map(parseContentItem),
  };

  if (type === "TEXT") {
    const text = dataSet.string("x0040a160");
    if (text != null) {
      node.text = trimmed(text);
    }
  }
  if (type === "NUM") {
    const measured = sequenceItems(dataSet, "x0040a300")[0];
    const numericValue = firstFloat(measured?.string("x0040a30a"));
    if (numericValue != null) {
      node.value = numericValue;
    }
    const unitCode = sequenceItems(measured, "x004008ea")[0]?.string("x00080100");
    if (unitCode != null) {
      node.unit = trimmed(unitCode);
    }
  }
  if (type === "CODE") {
    const code = codeMeaning(dataSet, "x0040a168");
    if (code != null) {
      node.code = code;
    }
  }
  if (type === "IMAGE") {
    const uid = sequenceItems(dataSet, "x00081199")[0]?.string("x00081155");
    if (uid != null) {
      node.imageRef = trimmed(uid);
    }
  }

  return node;
}

/**
 * Every NUM item in the tree, as a table row: `path` is the breadcrumb of
 * enclosing container names, `imageRef` is the SOP instance UID of an IMAGE
 * item that is a sibling of the measurement (the reference disc's CT
 * Coronary report pairs a lesion's TEXT identifier, NUM length, and IMAGE
 * evidence snapshot as siblings inside one container).
 */
export function flattenMeasurements(nodes: SrNode[]): SrMeasurement[] {
  const out: SrMeasurement[] = [];
  walkMeasurements(nodes, [], out);
  return out;
}

function walkMeasurements(siblings: SrNode[], path: string[], out: SrMeasurement[]) {
  const imageRef = siblings.find((node) => node.type === "IMAGE")?.imageRef;
  const label = siblings.find(
    (node) => node.type === "TEXT" && IDENTIFIER_NAME_RE.test(node.name),
  )?.text;
  for (const node of siblings) {
    if (node.type === "NUM" && node.value != null) {
      out.push({
        path,
        name: node.name,
        value: node.value,
        unit: node.unit ?? "",
        imageRef,
        label,
      });
    }
    if (node.children.length > 0) {
      const childPath = node.type === "CONTAINER" ? [...path, node.name] : path;
      walkMeasurements(node.children, childPath, out);
    }
  }
}

/** A TEXT item's name that identifies what it's naming (e.g. "Lesion Identifier"). */
const IDENTIFIER_NAME_RE = /identifier|label|name/i;

/** Rounds to at most 2 decimals and appends the unit: `2.09451 cm` -> "2.09 cm". */
const MEASUREMENT_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatMeasurement(value: number, unit: string): string {
  const formatted = MEASUREMENT_NUMBER_FORMAT.format(value);
  return unit ? `${formatted} ${unit}` : formatted;
}

/**
 * Refines `viewabilityFromMeta`'s cheap guess once the file is actually
 * parsed (plan 11): a tree with a non-blank TEXT or a NUM value somewhere
 * in it has something to show ("report"); a tree that parsed to zero
 * content items really is empty ("empty-report" — the assumption
 * `viewabilityFromMeta` makes for every Basic Text SR); anything else —
 * the parse failed, or the tree has nodes but none of them carry readable
 * text or a value (e.g. a vendor's private CODE-only session marker) —
 * is "opaque".
 */
export function srViewability(
  parsed: { title: string; nodes: SrNode[] } | null,
): "report" | "empty-report" | "opaque" {
  if (!parsed) {
    return "opaque";
  }
  if (parsed.nodes.length === 0) {
    return "empty-report";
  }
  return hasReadableContent(parsed.nodes) ? "report" : "opaque";
}

function hasReadableContent(nodes: SrNode[]): boolean {
  return nodes.some(
    (node) =>
      (node.type === "TEXT" && !!node.text) ||
      (node.type === "NUM" && node.value != null) ||
      hasReadableContent(node.children),
  );
}

function sequenceItems(dataSet: DataSet | undefined, tag: string): DataSet[] {
  if (!dataSet) {
    return [];
  }
  const element = dataSet.elements[tag];
  return (element?.items ?? [])
    .map((item) => item.dataSet)
    .filter((itemDataSet): itemDataSet is DataSet => itemDataSet != null);
}

/** First item's CodeMeaning (0008,0104) of a code sequence, trimmed. */
function codeMeaning(dataSet: DataSet, tag: string): string | undefined {
  const meaning = sequenceItems(dataSet, tag)[0]?.string("x00080104");
  return meaning != null ? trimmed(meaning) : undefined;
}

function trimmed(raw: string): string {
  return raw.trim();
}

/** First value of a DS element; a blank value (Number("") === 0) means "no value". */
function firstFloat(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const first = raw.split("\\")[0]?.trim();
  if (!first) {
    return null;
  }
  const value = Number(first);
  return Number.isNaN(value) ? null : value;
}
