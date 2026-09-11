import { useEffect, useState } from "react";
import type { RouteComponentProps } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Download, FileText } from "lucide-react";

function fileNameFromDisposition(header: string | null): string {
  if (!header) {
    return "document";
  }
  const match = header.match(/filename="([^"]+)"/);
  return match?.[1] || "document";
}

type SharedView =
  | { kind: "loading" }
  | { kind: "file"; objectUrl: string; mimeType: string; fileName: string }
  | { kind: "not_found" }
  | { kind: "gone" }
  | { kind: "error" };

export default function SharedFile({ params }: RouteComponentProps<{ token: string }>) {
  const token = params.token;
  const [view, setView] = useState<SharedView>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setView({ kind: "not_found" });
      return;
    }

    let cancelled = false;
    let objectUrl: string | undefined;

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
        const blob = await response.blob();
        if (cancelled) {
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setView({
          kind: "file",
          objectUrl,
          mimeType: response.headers.get("content-type") || blob.type,
          fileName: fileNameFromDisposition(response.headers.get("content-disposition")),
        });
      } catch {
        if (!cancelled) {
          setView({ kind: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="card-vault w-full max-w-3xl">
        <CardContent className="p-6">
          {view.kind === "loading" && (
            <p className="text-foreground-muted font-body">Loading shared file…</p>
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
                This file could not be opened.
              </p>
            </div>
          )}

          {view.kind === "file" && (
            <div className="space-y-4" data-testid="share-file">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary shrink-0" />
                  <h1 className="font-display text-foreground truncate">{view.fileName}</h1>
                </div>
                <Button asChild variant="outline" className="border-border">
                  <a href={view.objectUrl} download={view.fileName}>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </a>
                </Button>
              </div>
              {view.mimeType.startsWith("image/") ? (
                <img
                  src={view.objectUrl}
                  alt={view.fileName}
                  className="max-h-[70vh] w-full object-contain rounded-xl"
                />
              ) : (
                <iframe
                  src={view.objectUrl}
                  title={view.fileName}
                  className="w-full h-[70vh] rounded-xl border border-border bg-surface-1"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
