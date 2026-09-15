import { useEffect, useState } from "react";
import type { RouteComponentProps } from "wouter";
import type { SharePacket } from "@/lib/sdk";
import { studySeries } from "@shared/studies";
import { FileSourceProvider } from "@/lib/file-source-context";
import { sharedSource } from "@/lib/file-source";
import { ReportContent } from "@/pages/report";
import { ShareFooter, ShareHeader, loadShare } from "@/pages/shared-file";

type View = Awaited<ReturnType<typeof loadShare>>;

/** A structured report inside a shared study, read through the share token. */
export default function SharedReport({ params }: RouteComponentProps<{ token: string; documentId: string }>) {
  const token = params.token;
  const documentId = Number(params.documentId);
  const [view, setView] = useState<View>({ kind: "loading" });

  useEffect(() => {
    document.title = "Shared report · MediVault";
    let cancelled = false;
    loadShare(token).then((next) => {
      if (!cancelled) setView(next);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const packet: SharePacket | null = view.kind === "packet" ? view.packet : null;
  const study = packet?.studies.find((candidate) =>
    studySeries(candidate).some((record) => record.id === documentId),
  );
  const record = study ? studySeries(study).find((candidate) => candidate.id === documentId) : undefined;
  const backHref = `/s/${encodeURIComponent(token)}`;

  return (
    <FileSourceProvider source={sharedSource(token)}>
      <div className="min-h-screen bg-background" data-testid="shared-report-page">
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-10">
          {view.kind === "loading" ? (
            <p className="text-foreground-muted font-body">Opening the shared report…</p>
          ) : !packet || !study || !record ? (
            <>
              <ShareHeader label={null} expiresAt={packet?.expiresAt ?? new Date().toISOString()} />
              <p className="text-foreground-muted font-body" data-testid="shared-report-missing">
                This report isn't part of the shared record, or the share has ended.
              </p>
            </>
          ) : (
            <ReportContent study={study} record={record} backHref={backHref} backLabel="Back to the shared record" />
          )}
          <ShareFooter />
        </div>
      </div>
    </FileSourceProvider>
  );
}
