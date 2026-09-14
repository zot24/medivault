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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  useCreateCaseShare,
  useDocuments,
  useRevokeCaseShare,
  useShares,
  useSymptoms,
  type ShareTtl,
} from "@/lib/sdk";
import {
  documentIdsForItems,
  documentItemKey,
  listDocumentItems,
  studyLabel,
  type DocumentItem,
} from "@shared/studies";
import { Copy } from "lucide-react";

const LIFE_LABEL = {
  live: "Live",
  expired: "Expired",
  revoked: "Revoked",
} as const;

interface CaseShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function toggleKey(keys: string[], key: string): string[] {
  return keys.includes(key) ? keys.filter((item) => item !== key) : [...keys, key];
}

/** A study is one line here; ticking it shares all of its series. */
function itemTitle(item: DocumentItem): string {
  if (item.kind === "document") {
    return item.record.title;
  }
  const label = studyLabel(item.study) || "Imaging study";
  const count =
    item.study.seriesCount === 1 ? "1 series" : `${item.study.seriesCount} series`;
  return `${label} (${count})`;
}

export default function CaseShareDialog({
  open,
  onOpenChange,
}: CaseShareDialogProps) {
  const { toast } = useToast();
  const [ttl, setTtl] = useState<ShareTtl>("24h");
  const [label, setLabel] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [symptomIds, setSymptomIds] = useState<number[]>([]);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const { data: documents } = useDocuments(undefined, { enabled: open });
  const { data: symptoms } = useSymptoms(undefined, { enabled: open });
  const { data: shares } = useShares({ enabled: open });
  const createShare = useCreateCaseShare();
  const revokeShare = useRevokeCaseShare();

  const items = listDocumentItems(documents ?? []);
  // The share API still speaks in document ids, so a ticked study expands
  // into every series it holds.
  const documentIds = documentIdsForItems(
    items.filter((item) => selectedKeys.includes(documentItemKey(item))),
  );

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setCopiedUrl(null);
      setLabel("");
      setTtl("24h");
      setSelectedKeys([]);
      setSymptomIds([]);
    }
    onOpenChange(next);
  };

  const handleCreate = async () => {
    if (documentIds.length === 0) {
      toast({
        title: "Select documents",
        description: "A case share needs at least one document you own.",
        variant: "destructive",
      });
      return;
    }
    try {
      const created = await createShare.mutateAsync({
        documentIds,
        ttl,
        label: label.trim() || undefined,
        symptomIds: symptomIds.length > 0 ? symptomIds : undefined,
      });
      const url = `${window.location.origin}${created.path}`;
      setCopiedUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link copied",
          description: "Anyone with the link can open the case until it expires.",
        });
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
      <DialogContent className="sm:max-w-lg bg-card border-border rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-foreground">Share case</DialogTitle>
          <DialogDescription className="font-body text-foreground-muted">
            Bind documents into one expiring packet. The full URL is shown only once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-body">Documents</Label>
            <div className="max-h-40 overflow-y-auto space-y-2 rounded-xl border border-border p-3">
              {items.length === 0 && (
                <p className="text-sm text-foreground-muted font-body">No documents yet.</p>
              )}
              {items.map((item) => {
                const key = documentItemKey(item);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 text-sm font-body text-foreground"
                  >
                    <Checkbox
                      checked={selectedKeys.includes(key)}
                      onCheckedChange={() =>
                        setSelectedKeys((current) => toggleKey(current, key))
                      }
                      data-testid={`case-share-${key}`}
                    />
                    <span className="truncate">{itemTitle(item)}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-body">Symptoms (optional snapshot)</Label>
            <div className="max-h-32 overflow-y-auto space-y-2 rounded-xl border border-border p-3">
              {(symptoms ?? []).length === 0 && (
                <p className="text-sm text-foreground-muted font-body">No symptoms logged.</p>
              )}
              {(symptoms ?? []).map((symptom) => (
                <label
                  key={symptom.id}
                  className="flex items-center gap-2 text-sm font-body text-foreground"
                >
                  <Checkbox
                    checked={symptomIds.includes(symptom.id)}
                    onCheckedChange={() =>
                      setSymptomIds((current) => toggleId(current, symptom.id))
                    }
                    data-testid={`case-share-symptom-${symptom.id}`}
                  />
                  <span className="truncate">
                    {symptom.symptomName} ({symptom.severity}/10)
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="case-share-ttl" className="font-body">Expires in</Label>
            <Select value={ttl} onValueChange={(value) => setTtl(value as ShareTtl)}>
              <SelectTrigger id="case-share-ttl" data-testid="select-case-share-ttl">
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
            <Label htmlFor="case-share-label" className="font-body">Label (optional)</Label>
            <Input
              id="case-share-label"
              value={label}
              maxLength={80}
              placeholder="Dr. Chen Friday visit"
              onChange={(event) => setLabel(event.target.value)}
              data-testid="input-case-share-label"
            />
          </div>

          <Button
            className="w-full btn-sanctuary"
            onClick={handleCreate}
            disabled={createShare.isPending}
            data-testid="button-create-case-share"
          >
            Create case link
          </Button>

          {copiedUrl && (
            <div className="flex items-center gap-2">
              <Input readOnly value={copiedUrl} className="font-mono text-xs" data-testid="input-case-share-url" />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 border-border"
                onClick={() => navigator.clipboard.writeText(copiedUrl)}
                data-testid="button-copy-case-share"
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
                  data-testid={`case-share-row-${share.id}`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-body text-foreground truncate">
                      {share.label || "Untitled case"}
                    </p>
                    <p className="text-xs text-foreground-muted font-body">
                      {share.documentIds.length} document{share.documentIds.length === 1 ? "" : "s"}
                    </p>
                    <span className="badge-sage capitalize">{LIFE_LABEL[share.life]}</span>
                  </div>
                  {share.life !== "revoked" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-border text-foreground hover:bg-destructive/10"
                      disabled={revokeShare.isPending}
                      onClick={() => revokeShare.mutate({ shareId: share.id })}
                      data-testid={`button-revoke-case-share-${share.id}`}
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
