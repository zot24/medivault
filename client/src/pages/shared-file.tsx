import { useEffect, useState } from "react";
import { Link, type RouteComponentProps } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { FrozenSymptom, PublicDocument, SharePacket } from "@/lib/sdk";
import type { MedicalDocument } from "@shared/schema";
import { studyCounts, studyKindCountLabel, studyLabel } from "@shared/studies";
import { localDate } from "@shared/upload-kinds";
import { FileSourceProvider } from "@/lib/file-source-context";
import { sharedSource } from "@/lib/file-source";
import { StudyContent } from "@/pages/study";
import { sharedFileHref, sharedReportHref, standaloneDocuments } from "@/lib/share-portal";

type SharedView =
  | { kind: "loading" }
  | { kind: "packet"; packet: SharePacket }
  | { kind: "not_found" }
  | { kind: "gone" }
  | { kind: "error" };

/** Public records carry everything the study components read; the omitted owner fields are never used. */
function asRecord(document: PublicDocument): MedicalDocument {
  return document as MedicalDocument;
}

export async function loadShare(token: string): Promise<SharedView> {
  try {
    const response = await fetch(`/api/s/${encodeURIComponent(token)}`);
    if (response.status === 404) return { kind: "not_found" };
    if (response.status === 410) return { kind: "gone" };
    if (!response.ok) return { kind: "error" };
    return { kind: "packet", packet: (await response.json()) as SharePacket };
  } catch {
    return { kind: "error" };
  }
}

function SnapshotList({ snapshot }: { snapshot: FrozenSymptom[] }) {
  return (
    <section className="space-y-3" data-testid="share-snapshot">
      <h2 className="text-lg font-semibold text-foreground font-display">Symptoms at the time of sharing</h2>
      <ul className="space-y-2">
        {snapshot.map((row) => (
          <li key={row.id} className="text-sm font-body text-foreground">
            <span className="font-medium">{row.symptomName}</span>
            {` · ${row.severity}/10`}
            {row.location ? ` · ${row.location}` : ""}
            {row.dateRecorded ? ` · ${row.dateRecorded}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}

function DocumentPreview({ token, document }: { token: string; document: PublicDocument }) {
  const href = sharedFileHref(token, document.id);
  return (
    <Card className="card-sanctuary" data-testid={`share-document-${document.id}`}>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="text-foreground font-display text-xl">{document.title}</h3>
          <p className="text-sm text-foreground-muted font-body">
            {document.documentDate && format(localDate(document.documentDate), "MMMM d, yyyy")}
            {document.facilityName ? ` · ${document.facilityName}` : ""}
          </p>
        </div>
        {document.mimeType.startsWith("image/") ? (
          <img src={href} alt={document.title} className="max-h-[70vh] w-full object-contain rounded-xl bg-black" />
        ) : document.mimeType === "application/pdf" ? (
          <iframe src={href} title={document.title} className="w-full h-[75vh] rounded-xl border border-border bg-surface-1" />
        ) : (
          <p className="text-sm text-foreground-muted font-body">This file has no preview.</p>
        )}
      </CardContent>
    </Card>
  );
}

function SharedStudy({ token, study }: { token: string; study: SharePacket["studies"][number] }) {
  const counts = studyCounts(study);
  return (
    <section className="space-y-6" data-testid={`share-study-${study.studyInstanceUid}`}>
      <div>
        <div className="flex items-center flex-wrap gap-2 mb-3">
          {study.modalities.map((modality) => (
            <span key={modality} className="badge-sage">
              <span className="font-body">{modality}</span>
            </span>
          ))}
        </div>
        <h2 className="text-foreground font-display text-3xl mb-1" data-testid="share-study-label">
          {studyLabel(study)}
        </h2>
        {study.studyDescription && study.studyDescription !== studyLabel(study) && (
          <p className="text-foreground-muted font-body mb-1">{study.studyDescription}</p>
        )}
        <p className="text-foreground-muted font-body" data-testid="share-study-counts">
          {study.documentDate && format(localDate(study.documentDate), "MMMM d, yyyy")}
          {" · "}
          {counts.seriesCount === 1 ? "1 series" : `${counts.seriesCount} series`}
          {" · "}
          {studyKindCountLabel(study, study.primaryPhases, null)}
        </p>
      </div>
      <StudyContent study={study} reportHref={sharedReportHref(token)} />
    </section>
  );
}

/** The page's own header: who shared this, through what, until when. */
export function ShareHeader({ label, expiresAt }: { label: string | null; expiresAt: string }) {
  return (
    <header className="mb-10" data-testid="share-header">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
        </div>
        <div>
          <p className="text-foreground font-display text-lg leading-tight">MediVault</p>
          <p className="text-xs text-foreground-muted font-body">Shared privately, for your eyes only</p>
        </div>
      </div>
      <h1 className="text-foreground font-display mb-2" data-testid="share-title">
        {label || "A shared medical record"}
      </h1>
      <p className="text-foreground-muted font-body">
        Someone chose to share this with you. It stays available until{" "}
        {format(new Date(expiresAt), "MMMM d, yyyy 'at' HH:mm")}, and nothing here can be downloaded or
        forwarded — open it, look, and close it.
      </p>
    </header>
  );
}

/** Invitation for the person looking: what MediVault is, in one breath, and where to start. */
export function ShareFooter() {
  return (
    <footer className="mt-16 pt-8 border-t border-border" data-testid="share-footer">
      <div className="card-sanctuary rounded-2xl p-6 md:p-8 mb-6">
        <p className="text-foreground font-display text-xl mb-2">Your health story, in one calm place.</p>
        <p className="text-foreground-muted font-body mb-4 max-w-2xl">
          MediVault keeps scans, reports and symptoms together, readable by you and shareable with the
          people you choose — a whole CT, echo or catheterization, not a folder of files. It is free to
          start, and you decide who sees what, for how long.
        </p>
        <Link href="/">
          <Button data-testid="share-cta-join">
            <span className="font-body">Create your own vault</span>
          </Button>
        </Link>
      </div>
      <p className="text-xs text-foreground-subtle font-body">
        © {new Date().getFullYear()} MediVault. This page was shared by a MediVault member and may contain
        personal health information. If it reached you by mistake, please close it and tell the person who
        shared it.
      </p>
    </footer>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background" data-testid="share-page">
      <div className="max-w-5xl mx-auto px-6 lg:px-8 py-10">{children}</div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="max-w-xl mx-auto text-center py-16">
        <AlertCircle className="h-8 w-8 mx-auto mb-4 text-foreground-subtle" aria-hidden="true" />
        <h1 className="text-2xl font-semibold text-foreground mb-3 font-display">{title}</h1>
        <p className="text-foreground-muted font-body">{body}</p>
      </div>
      <ShareFooter />
    </Shell>
  );
}

export default function SharedFile({ params }: RouteComponentProps<{ token: string }>) {
  const token = params.token;
  const [view, setView] = useState<SharedView>({ kind: "loading" });

  useEffect(() => {
    document.title = "Shared with you · MediVault";
    if (!token) {
      setView({ kind: "not_found" });
      return;
    }
    let cancelled = false;
    loadShare(token).then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (view.kind === "loading") {
    return (
      <Shell>
        <p className="text-foreground-muted font-body" data-testid="share-loading">Opening the shared record…</p>
      </Shell>
    );
  }
  if (view.kind === "not_found") {
    return <Notice title="This link doesn't lead anywhere" body="Check the address you were given, or ask the person who shared it for a new link." />;
  }
  if (view.kind === "gone") {
    return <Notice title="This share has ended" body="The person who shared it set a time limit, or turned it off. Ask them for a new link if you still need it." />;
  }
  if (view.kind === "error") {
    return <Notice title="Something went wrong" body="The record couldn't be opened right now. Try again in a moment." />;
  }

  const { packet } = view;
  const documents = standaloneDocuments(packet);
  return (
    <FileSourceProvider source={sharedSource(token)}>
      <Shell>
        <ShareHeader label={packet.label} expiresAt={packet.expiresAt} />
        <div className="space-y-14">
          {packet.studies.map((study) => (
            <SharedStudy key={study.studyInstanceUid} token={token} study={study} />
          ))}
          {documents.map((document) => (
            <DocumentPreview key={document.id} token={token} document={document} />
          ))}
          {packet.snapshot && packet.snapshot.length > 0 && <SnapshotList snapshot={packet.snapshot} />}
        </div>
        <ShareFooter />
      </Shell>
    </FileSourceProvider>
  );
}
