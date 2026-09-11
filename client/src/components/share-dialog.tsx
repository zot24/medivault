import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateShare,
  useDocumentShares,
  useRevokeShare,
  type ShareTtl,
} from "@/lib/sdk";
import { Copy } from "lucide-react";

const LIFE_LABEL = {
  live: "Live",
  expired: "Expired",
  revoked: "Revoked",
} as const;

interface ShareDialogProps {
  documentId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareDialog({
  documentId,
  open,
  onOpenChange,
}: ShareDialogProps) {
  const { toast } = useToast();
  const [ttl, setTtl] = useState<ShareTtl>("24h");
  const [label, setLabel] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const { data: shares } = useDocumentShares(documentId, { enabled: open });
  const createShare = useCreateShare();
  const revokeShare = useRevokeShare();

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCopiedUrl(null);
      setLabel("");
      setTtl("24h");
    }
    onOpenChange(next);
  };

  const handleCreate = async () => {
    try {
      const created = await createShare.mutateAsync({
        documentId,
        ttl,
        label: label.trim() || undefined,
      });
      const url = `${window.location.origin}${created.path}`;
      setCopiedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "Link copied", description: "Anyone with the link can open the file until it expires." });
      } catch {
        toast({ title: "Link created", description: "Copy the URL below." });
      }
    } catch (error) {
      toast({
        title: "Could not create link",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Share document</DialogTitle>
          <DialogDescription className="font-body text-foreground-muted">
            Create an expiring link. The full URL is shown only once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="share-ttl" className="font-body">Expires in</Label>
            <Select value={ttl} onValueChange={(value) => setTtl(value as ShareTtl)}>
              <SelectTrigger id="share-ttl" data-testid="select-share-ttl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="24h">24 hours</SelectItem>
                <SelectItem value="7d">7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="share-label" className="font-body">Label (optional)</Label>
            <Input
              id="share-label"
              value={label}
              maxLength={80}
              placeholder="Dr. Chen Friday"
              onChange={(event) => setLabel(event.target.value)}
              data-testid="input-share-label"
            />
          </div>

          <Button
            className="w-full btn-sanctuary"
            onClick={handleCreate}
            disabled={createShare.isPending}
            data-testid="button-create-share"
          >
            Create link
          </Button>

          {copiedUrl && (
            <div className="flex items-center gap-2">
              <Input readOnly value={copiedUrl} className="font-mono text-xs" data-testid="input-share-url" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-border"
                onClick={() => navigator.clipboard.writeText(copiedUrl)}
                data-testid="button-copy-share"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}

          {shares && shares.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between gap-3 py-2"
                  data-testid={`share-row-${share.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-body text-foreground truncate">
                      {share.label || "Untitled link"}
                    </p>
                    <span className="badge-sage capitalize">{LIFE_LABEL[share.life]}</span>
                  </div>
                  {share.life !== "revoked" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-destructive/10"
                      disabled={revokeShare.isPending}
                      onClick={() =>
                        revokeShare.mutate({ documentId, shareId: share.id })
                      }
                      data-testid={`button-revoke-share-${share.id}`}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
