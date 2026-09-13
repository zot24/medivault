import type { MedicalDocument } from "@shared/schema";

function documentTypeLabel(type: string): string {
  return type.replace("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

interface TypeBadgeProps {
  document: Pick<MedicalDocument, "documentType" | "dicomMeta">;
  testId?: string;
}

/**
 * A record's type badge: its DICOM modality (CT, US, XA, SR, ...) when it
 * has `dicomMeta`, the generic `documentType` label otherwise. A modality
 * tells a patient what the scan was; "X Ray" for every CT and ultrasound
 * does not.
 */
export default function TypeBadge({ document, testId }: TypeBadgeProps) {
  const label = document.dicomMeta
    ? document.dicomMeta.modality
    : documentTypeLabel(document.documentType);
  return (
    <span className="badge-sage capitalize" data-testid={testId}>
      {label}
    </span>
  );
}
