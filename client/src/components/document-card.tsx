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
  Building
} from "lucide-react";
import type { MedicalDocument } from "@shared/schema";

interface DocumentCardProps {
  document: MedicalDocument;
  onDelete: (id: number) => void;
}

export default function DocumentCard({ document, onDelete }: DocumentCardProps) {
  const getDocumentTypeColor = (type: string) => {
    switch (type) {
      case "lab_result":
        return "bg-health-green bg-opacity-10 text-health-green";
      case "prescription":
        return "bg-warm-amber bg-opacity-10 text-warm-amber";
      case "x_ray":
        return "bg-trust-purple bg-opacity-10 text-trust-purple";
      case "consultation":
        return "bg-medical-blue bg-opacity-10 text-medical-blue";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    return type.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleDownload = () => {
    // Create a download link
    const link = document.createElement("a");
    link.href = `/api/files/${document.filePath.split("/").pop()}`;
    link.download = document.fileName;
    link.click();
  };

  const handleView = () => {
    // Open file in new tab
    window.open(`/api/files/${document.filePath.split("/").pop()}`, "_blank");
  };

  return (
    <Card className="hover:shadow-lg transition-all duration-200 group">
      <CardContent className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-medical-blue bg-opacity-10 rounded-lg flex items-center justify-center">
              <FileText className="text-medical-blue h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-professional-dark text-lg leading-tight">
                {document.title}
              </h3>
              <Badge className={`mt-1 text-xs ${getDocumentTypeColor(document.documentType)}`}>
                {getDocumentTypeLabel(document.documentType)}
              </Badge>
            </div>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleView}>
                <Eye className="mr-2 h-4 w-4" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Download
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onDelete(document.id)}
                className="text-red-600"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Description */}
        {document.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {document.description}
          </p>
        )}

        {/* Metadata */}
        <div className="space-y-2 mb-4">
          <div className="flex items-center text-sm text-gray-500">
            <Calendar className="mr-2 h-4 w-4" />
            <span>
              {format(new Date(document.documentDate), "MMM d, yyyy")}
            </span>
          </div>
          
          {document.doctorName && (
            <div className="flex items-center text-sm text-gray-500">
              <User className="mr-2 h-4 w-4" />
              <span>{document.doctorName}</span>
            </div>
          )}
          
          {document.facilityName && (
            <div className="flex items-center text-sm text-gray-500">
              <Building className="mr-2 h-4 w-4" />
              <span>{document.facilityName}</span>
            </div>
          )}
        </div>

        {/* Tags */}
        {document.tags && document.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {document.tags.slice(0, 3).map((tag, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {document.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{document.tags.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <span>{document.fileName}</span>
          <span>{(parseInt(document.fileSize) / 1024 / 1024).toFixed(1)} MB</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 mt-4 pt-4 border-t border-gray-100">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleView}
            className="flex-1"
          >
            <Eye className="mr-2 h-4 w-4" />
            View
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDownload}
            className="flex-1"
          >
            <Download className="mr-2 h-4 w-4" />
            Download
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
