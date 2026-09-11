import { useEffect, useState } from "react";
import type { RouteComponentProps } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, FileText } from "lucide-react";
import type { FrozenSymptom, SharePacket, SharedFileMeta } from "@/lib/sdk";

type SharedView =
  | { kind: "loading" }
  | { kind: "packet"; packet: SharePacket }
  | { kind: "not_found" }
  | { kind: "gone" }
  | { kind: "error" };

function fileHref(token: string, documentId: number): string {
  return `/api/s/${encodeURIComponent(token)}/files/${documentId}`;
}

function SnapshotList({ snapshot }: { snapshot: FrozenSymptom[] }) {
  return (
    <div className="space-y-2" data-testid="share-snapshot">
      <h2 className="font-display text-foreground">Symptom snapshot</h2>
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
    </div>
  );
}

function PacketPreview({
  token,
  file,
}: {
  token: string;
  file: SharedFileMeta;
}) {
  const href = fileHref(token, file.id);
  if (file.mimeType.startsWith("image/")) {
    return (
      <img
        src={href}
        alt={file.fileName}
        className="max-h-[50vh] w-full object-contain rounded-xl"
      />
    );
  }
  if (file.mimeType === "application/pdf") {
    return (
      <iframe
        src={href}
        title={file.fileName}
        className="w-full h-[50vh] rounded-xl border border-border bg-surface-1"
      />
    );
  }
  return null;
}

export default function SharedFile({ params }: RouteComponentProps<{ token: string }>) {
  const token = params.token;
  const [view, setView] = useState<SharedView>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setView({ kind: "not_found" });
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/s/${encodeURIComponent(token)}`);
        if (cancelled) {
          return;
        }
        if (response.status === 404) {
          setView({ kind: "not_found" });
          return;
        }
        if (response.status === 410) {
          setView({ kind: "gone" });
          return;
        }
        if (!response.ok) {
          setView({ kind: "error" });
          return;
        }
        const packet = (await response.json()) as SharePacket;
        if (cancelled) {
          return;
        }
        setView({ kind: "packet", packet });
      } catch {
        if (!cancelled) {
          setView({ kind: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const preview = view.kind === "packet" ? view.packet.files[0] : undefined;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="card-vault w-full max-w-3xl">
        <CardContent className="p-6">
          {view.kind === "loading" && (
            <p className="text-foreground-muted font-body">Loading shared case...</p>
          )}

          {view.kind === "not_found" && (
            <div className="flex gap-3" data-testid="share-not-found">
              <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
              <div>
                <h1 className="text-xl font-display text-foreground">Link not found</h1>
                <p className="mt-2 text-sm text-foreground-muted font-body">
                  This share link does not exist.
                </p>
              </div>
            </div>
          )}

          {view.kind === "gone" && (
            <div className="flex gap-3" data-testid="share-gone">
              <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
              <div>
                <h1 className="text-xl font-display text-foreground">Link expired</h1>
                <p className="mt-2 text-sm text-foreground-muted font-body">
                  This share link has expired or been revoked.
                </p>
              </div>
            </div>
          )}

          {view.kind === "error" && (
            <div className="flex gap-3">
              <AlertCircle className="h-6 w-6 text-destructive shrink-0" />
              <p className="text-sm text-foreground-muted font-body">
                This case could not be opened.
              </p>
            </div>
          )}

          {view.kind === "packet" && token && (
            <div className="space-y-6" data-testid="share-packet">
              <div>
                <h1 className="font-display text-foreground">
                  {view.packet.label || "Shared case"}
                </h1>
                <p className="mt-1 text-sm text-foreground-muted font-body">
                  Expires {new Date(view.packet.expiresAt).toLocaleString()}
                </p>
              </div>

              <ul className="space-y-2">
                {view.packet.files.map((file) => (
                  <li
                    key={file.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                    data-testid={`share-packet-file-${file.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <p className="font-body text-foreground truncate">{file.title}</p>
                        <p className="text-xs text-foreground-muted font-body truncate">
                          {file.fileName}
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="outline" className="border-border shrink-0">
                      <a href={fileHref(token, file.id)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>

              {preview && <PacketPreview token={token} file={preview} />}

              {view.packet.snapshot && (
                <SnapshotList snapshot={view.packet.snapshot} />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
