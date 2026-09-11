import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  FileText,
  MoreVertical,
  Download,
  Trash2,
  Eye,
  Calendar,
  User,
  Building,
  ChevronRight,
  Shield
} from "lucide-react";
import type { MedicalDocument } from "@shared/schema";

interface DocumentCardProps {
  document: MedicalDocument;
  onDelete: (id: number) => void;
}

export default function DocumentCard({ document: medicalDocument, onDelete }: DocumentCardProps) {
  const getDocumentTypeStyle = (type: string) => {
    switch (type) {
      case "lab_result":
        return { bg: "bg-primary-light", text: "text-primary", icon: "bg-primary" };
      case "prescription":
        return { bg: "bg-secondary/10", text: "text-secondary", icon: "bg-secondary" };
      case "x_ray":
        return { bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-600 dark:text-amber-400", icon: "bg-amber-500" };
      case "consultation":
        return { bg: "bg-primary-light", text: "text-primary", icon: "bg-gradient-to-br from-primary to-secondary" };
      default:
        return { bg: "bg-surface-2", text: "text-foreground-muted", icon: "bg-foreground-muted" };
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    return type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const style = getDocumentTypeStyle(medicalDocument.documentType);

  const handleDownload = () => {
    const link = window.document.createElement("a");
    link.href = `/api/files/${medicalDocument.filePath.split("/").pop()}`;
    link.download = medicalDocument.fileName;
    link.click();
  };

  const handleView = () => {
    window.open(`/api/files/${medicalDocument.filePath.split("/").pop()}`, "_blank");
  };

  return (
    <Card className="card-vault group transition-all duration-300 hover:-translate-y-1" data-testid={`document-card-${medicalDocument.id}`}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3 flex-1">
            <div className={`p-2.5 rounded-xl ${style.icon} group-hover:scale-105 transition-transform duration-200`}>
              <FileText className="text-white h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg leading-tight mb-2 font-display">
                {medicalDocument.title}
              </h3>
              <div className="flex items-center space-x-2">
                <span className={`badge-sage capitalize`}>
                  {getDocumentTypeLabel(medicalDocument.documentType)}
                </span>
                {medicalDocument.tags && medicalDocument.tags.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Shield className="h-3 w-3 text-secondary" />
                    <span className="text-xs text-foreground-subtle font-body">Secured</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 hover:bg-surface-1"
                data-testid={`document-menu-${medicalDocument.id}`}
              >
                <MoreVertical className="h-4 w-4 text-foreground-muted" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card border-border rounded-xl">
              <DropdownMenuItem onClick={handleView} className="text-foreground hover:bg-surface-1 rounded-lg" data-testid={`button-view-${medicalDocument.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                <span className="font-body">View</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload} className="text-foreground hover:bg-surface-1 rounded-lg" data-testid={`button-download-${medicalDocument.id}`}>
                <Download className="mr-2 h-4 w-4" />
                <span className="font-body">Download</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(medicalDocument.id)}
                className="text-destructive hover:bg-destructive/10 rounded-lg"
                data-testid={`button-delete-${medicalDocument.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                <span className="font-body">Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {medicalDocument.description && (
          <p className="text-foreground-muted text-sm mb-4 line-clamp-2 font-body">
            {medicalDocument.description}
          </p>
        )}

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-foreground-muted font-body">
            <Calendar className="mr-2 h-4 w-4 text-primary" />
            <span>
              {format(new Date(medicalDocument.documentDate), "MMM d, yyyy")}
            </span>
          </div>

          {medicalDocument.doctorName && (
            <div className="flex items-center text-sm text-foreground-muted font-body">
              <User className="mr-2 h-4 w-4 text-secondary" />
              <span>{medicalDocument.doctorName}</span>
            </div>
          )}

          {medicalDocument.facilityName && (
            <div className="flex items-center text-sm text-foreground-muted font-body">
              <Building className="mr-2 h-4 w-4 text-foreground-subtle" />
              <span>{medicalDocument.facilityName}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {medicalDocument.tags && medicalDocument.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {medicalDocument.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="px-2 py-1 text-xs bg-surface-1 text-foreground-muted rounded-full border border-border font-body">
                {tag}
              </span>
            ))}
            {medicalDocument.tags.length > 3 && (
              <span className="px-2 py-1 text-xs bg-surface-1 text-foreground-muted rounded-full border border-border font-body">
                +{medicalDocument.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-foreground-subtle mb-4 font-body">
          <span className="truncate mr-2">{medicalDocument.fileName}</span>
          <span>{(parseInt(medicalDocument.fileSize) / 1024 / 1024).toFixed(1)} MB</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-4 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={handleView}
            className="flex-1 border-border text-foreground hover:bg-surface-1 hover:border-primary/30 group/btn"
            data-testid={`button-view-primary-${medicalDocument.id}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            <span className="font-body">View</span>
            <ChevronRight className="ml-auto h-4 w-4 group-hover/btn:translate-x-1 transition-transform duration-200" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            className="flex-1 border-border text-foreground hover:bg-surface-1 hover:border-primary/30"
            data-testid={`button-download-primary-${medicalDocument.id}`}
          >
            <Download className="mr-2 h-4 w-4" />
            <span className="font-body">Download</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
