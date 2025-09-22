import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Sparkles
} from "lucide-react";
import type { MedicalDocument } from "@shared/schema";

interface DocumentCardProps {
  document: MedicalDocument;
  onDelete: (id: number) => void;
}

export default function DocumentCard({ document: medicalDocument, onDelete }: DocumentCardProps) {
  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case "lab_result":
        return "from-primary to-primary/70";
      case "prescription":
        return "from-secondary to-secondary/70";
      case "x_ray":
        return "from-accent to-accent/70";
      case "consultation":
        return "from-primary to-secondary";
      default:
        return "from-primary/50 to-secondary/50";
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    return type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleDownload = () => {
    // Create a download link
    const link = window.document.createElement("a");
    link.href = `/api/files/${medicalDocument.filePath.split("/").pop()}`;
    link.download = medicalDocument.fileName;
    link.click();
  };

  const handleView = () => {
    // Open file in new tab
    window.open(`/api/files/${medicalDocument.filePath.split("/").pop()}`, "_blank");
  };

  return (
    <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid={`document-card-${medicalDocument.id}`}>
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3 flex-1">
            <div className={`p-2.5 rounded-xl bg-gradient-to-br ${getDocumentTypeColor(medicalDocument.documentType)} group-hover:scale-105 transition-transform duration-200`}>
              <FileText className="text-white h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-lg leading-tight mb-2">
                {medicalDocument.title}
              </h3>
              <div className="flex items-center space-x-2">
                <span className={`px-3 py-1 text-xs font-medium bg-gradient-to-r ${getDocumentTypeColor(medicalDocument.documentType)} text-white rounded-full`}>
                  {getDocumentTypeLabel(medicalDocument.documentType)}
                </span>
                {medicalDocument.tags && medicalDocument.tags.length > 0 && (
                  <div className="flex items-center space-x-1">
                    <Sparkles className="h-3 w-3 text-primary" />
                    <span className="text-xs text-foreground-muted">AI Analyzed</span>
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
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8 hover:bg-white/10"
                data-testid={`document-menu-${medicalDocument.id}`}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-surface-2 border-white/20">
              <DropdownMenuItem onClick={handleView} className="text-foreground hover:bg-white/10" data-testid={`button-view-${medicalDocument.id}`}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload} className="text-foreground hover:bg-white/10" data-testid={`button-download-${medicalDocument.id}`}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(medicalDocument.id)}
                className="text-destructive hover:bg-destructive/10"
                data-testid={`button-delete-${medicalDocument.id}`}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {medicalDocument.description && (
          <p className="text-foreground-muted text-sm mb-4 line-clamp-2">
            {medicalDocument.description}
          </p>
        )}

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-foreground-muted">
            <Calendar className="mr-2 h-4 w-4" />
            <span>
              {format(new Date(medicalDocument.documentDate), "MMM d, yyyy")}
            </span>
          </div>
          
          {medicalDocument.doctorName && (
            <div className="flex items-center text-sm text-foreground-muted">
              <User className="mr-2 h-4 w-4" />
              <span>{medicalDocument.doctorName}</span>
            </div>
          )}
          
          {medicalDocument.facilityName && (
            <div className="flex items-center text-sm text-foreground-muted">
              <Building className="mr-2 h-4 w-4" />
              <span>{medicalDocument.facilityName}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {medicalDocument.tags && medicalDocument.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {medicalDocument.tags.slice(0, 3).map((tag, index) => (
              <span key={index} className="px-2 py-1 text-xs bg-white/10 text-foreground-muted rounded-full border border-white/10">
                {tag}
              </span>
            ))}
            {medicalDocument.tags.length > 3 && (
              <span className="px-2 py-1 text-xs bg-white/10 text-foreground-muted rounded-full border border-white/10">
                +{medicalDocument.tags.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-foreground-muted mb-4">
          <span className="truncate mr-2">{medicalDocument.fileName}</span>
          <span>{(parseInt(medicalDocument.fileSize) / 1024 / 1024).toFixed(1)} MB</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 pt-4 border-t border-white/10">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleView}
            className="flex-1 border-white/20 text-foreground hover:bg-white/5 group"
            data-testid={`button-view-primary-${medicalDocument.id}`}
          >
            <Eye className="mr-2 h-4 w-4" />
            <span>View</span>
            <ChevronRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform duration-200" />
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            className="flex-1 border-white/20 text-foreground hover:bg-white/5"
            data-testid={`button-download-primary-${medicalDocument.id}`}
          >
            <Download className="mr-2 h-4 w-4" />
            <span>Download</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}