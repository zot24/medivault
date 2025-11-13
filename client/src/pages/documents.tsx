import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import analytics from "@/lib/analytics/umami";
import DocumentCard from "@/components/document-card";
import UploadDialog from "@/components/upload-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Plus, 
  Search, 
  Filter,
  FileText,
  Upload,
  Brain,
  Sparkles,
  FileImage,
  BarChart3
} from "lucide-react";
import type { MedicalDocument } from "@shared/schema";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/api/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Track page visit
  useEffect(() => {
    if (isAuthenticated) {
      analytics.pageVisited('/documents');
    }
  }, [isAuthenticated]);

  // Track search usage (debounced)
  useEffect(() => {
    if (searchQuery && documents) {
      const timer = setTimeout(() => {
        const resultsCount = filteredDocuments.length;
        analytics.documentSearched(searchQuery, resultsCount);
      }, 1000); // Wait 1s after user stops typing

      return () => clearTimeout(timer);
    }
  }, [searchQuery, documents]);

  // Track filter usage
  useEffect(() => {
    if (filterType !== "all" && documents) {
      const resultsCount = filteredDocuments.length;
      analytics.documentFiltered(filterType, resultsCount);
    }
  }, [filterType, documents]);

  const { data: documents, isLoading: documentsLoading } = useQuery<MedicalDocument[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: number) => {
      await apiRequest("DELETE", `/api/documents/${documentId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: (error) => {
      if (isUnauthorizedError(error)) {
        toast({
          title: "Unauthorized",
          description: "You are logged out. Logging in again...",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/api/login";
        }, 500);
        return;
      }
      toast({
        title: "Error",
        description: "Failed to delete document",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-surface-1 border-white/10">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  const filteredDocuments = documents?.filter(doc => {
    const matchesSearch = !searchQuery || 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.doctorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.facilityName?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = filterType === "all" || doc.documentType === filterType;
    
    return matchesSearch && matchesType;
  }) || [];

  const handleDelete = (documentId: number) => {
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      // Find document type for analytics
      const document = documents?.find(doc => doc.id === documentId);
      if (document) {
        analytics.documentDeleted(document.documentType);
      }
      deleteMutation.mutate(documentId);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="documents-page">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12">
          <div className="max-w-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary">
                <FileText className="text-white h-5 w-5" />
              </div>
              <div className="inline-flex items-center space-x-2 bg-surface-1 border border-white/10 rounded-full px-3 py-1 text-xs text-foreground-muted">
                <Brain className="h-3 w-3 text-primary" />
                <span>AI Document Analysis</span>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-3">Medical Documents</h1>
            <p className="text-xl text-foreground-muted">
              Upload and organize your health records while our AI extracts key insights, tracks patterns, and builds your intelligent health profile.
            </p>
          </div>
          <Button
            onClick={() => {
              analytics.ctaClicked('upload_document_header', 'documents_page');
              setIsUploadOpen(true);
            }}
            className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 mt-6 lg:mt-0 px-6 py-3 rounded-xl"
            data-testid="button-upload-document"
          >
            <Plus className="mr-2 h-5 w-5" />
            Upload Document
          </Button>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-foreground-muted" />
            <Input
              placeholder="Search documents, doctors, or facilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-surface-1 border-white/20 text-foreground placeholder:text-foreground-muted"
              data-testid="input-search-documents"
            />
          </div>
          <div className="flex items-center space-x-3">
            <Filter className="h-4 w-4 text-foreground-muted" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48 bg-surface-1 border-white/20 text-foreground" data-testid="select-document-filter">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent className="bg-surface-2 border-white/20">
                <SelectItem value="all">All Documents</SelectItem>
                <SelectItem value="lab_result">Lab Results</SelectItem>
                <SelectItem value="prescription">Prescriptions</SelectItem>
                <SelectItem value="x_ray">X-Rays</SelectItem>
                <SelectItem value="consultation">Consultations</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Stats Row */}
        {documents && documents.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                    <FileText className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">Total</p>
                    <p className="text-lg font-bold text-foreground">{documents.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-secondary to-secondary/70">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">Filtered</p>
                    <p className="text-lg font-bold text-foreground">{filteredDocuments.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-accent to-accent/70">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">AI Analyzed</p>
                    <p className="text-lg font-bold text-foreground">{documents.filter(d => d.tags && d.tags.length > 0).length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-secondary">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">This Month</p>
                    <p className="text-lg font-bold text-foreground">
                      {documents.filter(doc => {
                        if (!doc.createdAt) return false;
                        const docDate = new Date(doc.createdAt);
                        const now = new Date();
                        return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
                      }).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Documents Grid */}
        {documentsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-surface-1 border-white/10">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredDocuments.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="documents-grid">
            {filteredDocuments.map((document) => (
              <DocumentCard
                key={document.id}
                document={document}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : documents && documents.length > 0 ? (
          <div className="text-center py-16">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 w-fit mx-auto mb-6">
              <Search className="w-12 h-12 text-primary mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-3">No documents found</h3>
            <p className="text-foreground-muted mb-6 max-w-sm mx-auto">
              Try adjusting your search or filter criteria to find what you're looking for
            </p>
            <Button 
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
              }}
              className="border-white/20 text-foreground hover:bg-white/5"
              data-testid="button-clear-filters"
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 w-fit mx-auto mb-8">
              <FileImage className="w-16 h-16 text-primary mx-auto" />
            </div>
            <h3 className="text-3xl font-bold text-foreground mb-4">Ready to unlock health insights?</h3>
            <p className="text-xl text-foreground-muted mb-8 max-w-2xl mx-auto leading-relaxed">
              Start building your intelligent health profile by uploading your first medical document. 
              Our AI will analyze lab results, prescriptions, and medical images to provide personalized insights.
            </p>
            <Button
              onClick={() => {
                analytics.ctaClicked('upload_first_document', 'documents_empty_state');
                setIsUploadOpen(true);
              }}
              className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 px-8 py-4 rounded-xl text-lg"
              data-testid="button-upload-first-document"
            >
              <Plus className="mr-2 h-5 w-5" />
              Upload Your First Document
            </Button>
            <div className="flex items-center justify-center space-x-6 mt-8 text-foreground-muted">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-primary" />
                <span className="text-sm">AI-Powered Analysis</span>
              </div>
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm">Pattern Recognition</span>
              </div>
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm">Secure Storage</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <UploadDialog 
        open={isUploadOpen} 
        onOpenChange={setIsUploadOpen}
      />
    </div>
  );
}