import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDocuments, useDeleteDocument, useStudies } from "@/lib/sdk";
import Navigation from "@/components/navigation";
import analytics from "@/lib/analytics/umami";
import DocumentCard from "@/components/document-card";
import StudyCard from "@/components/study-card";
import UploadDialog from "@/components/upload-dialog";
import CaseShareDialog from "@/components/case-share-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { documentStats, filterStudies, splitDocuments } from "@shared/studies";
import {
  Plus,
  Search,
  Filter,
  FileText,
  Upload,
  Shield,
  Leaf,
  FolderOpen
} from "lucide-react";

export default function Documents() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isCaseShareOpen, setIsCaseShareOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to view documents.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  useEffect(() => {
    if (isAuthenticated) {
      analytics.pageVisited('/documents');
    }
  }, [isAuthenticated]);

  const { data: documents, isLoading: documentsLoading } = useDocuments(undefined, {
    enabled: isAuthenticated,
  });
  const { data: studies, isLoading: studiesLoading } = useStudies({
    enabled: isAuthenticated,
  });

  // A DICOM series is collapsed into its study card; it doesn't also get an
  // ordinary document card. Stats below count a study as one item, not one
  // per series.
  const { ordinary: plainDocuments } = splitDocuments(documents ?? []);
  const studyList = studies ?? [];
  const studyFilter = { searchQuery, documentType: filterType };
  const stats = documentStats(plainDocuments, studyList, studyFilter);
  const filteredStudies = filterStudies(studyList, studyFilter);

  const filteredDocuments = plainDocuments.filter(doc => {
    const matchesSearch = !searchQuery ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.doctorName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.facilityName?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = filterType === "all" || doc.documentType === filterType;

    return matchesSearch && matchesType;
  }) || [];

  useEffect(() => {
    if (searchQuery && documents) {
      const timer = setTimeout(() => {
        analytics.documentSearched(searchQuery, filteredDocuments.length);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [searchQuery, documents, filteredDocuments.length]);

  useEffect(() => {
    if (filterType !== "all" && documents) {
      analytics.documentFiltered(filterType, filteredDocuments.length);
    }
  }, [filterType, documents, filteredDocuments.length]);

  const deleteMutation = useDeleteDocument({
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
    },
    onError: (error) => {
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        toast({
          title: "Session expired",
          description: "Please log in again.",
          variant: "destructive",
        });
        setTimeout(() => {
          window.location.href = "/login";
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
            <Skeleton className="h-10 w-64 mb-4" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="card-sanctuary">
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

  const handleDelete = (documentId: number) => {
    if (confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
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
              <div className="badge-sage">
                <span className="font-body">Secure Document Storage</span>
              </div>
            </div>
            <h1 className="text-foreground mb-3 font-display">Medical Documents</h1>
            <p className="text-xl text-foreground-muted font-body">
              Your health records, securely organized. Upload, categorize, and access your medical documents anytime.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 mt-6 lg:mt-0">
            <Button
              variant="outline"
              onClick={() => setIsCaseShareOpen(true)}
              className="border-border"
              data-testid="button-share-case"
            >
              <span className="font-body">Share case</span>
            </Button>
            <Button
              onClick={() => {
                analytics.ctaClicked('upload_document_header', 'documents_page');
                setIsUploadOpen(true);
              }}
              className="btn-sanctuary"
              data-testid="button-upload-document"
            >
              <Plus className="mr-2 h-5 w-5" />
              <span className="font-body">Upload Document</span>
            </Button>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-foreground-subtle" />
            <Input
              placeholder="Search documents, doctors, or facilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 input-sanctuary"
              data-testid="input-search-documents"
            />
          </div>
          <div className="flex items-center space-x-3">
            <Filter className="h-4 w-4 text-foreground-subtle" />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-48 input-sanctuary" data-testid="select-document-filter">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
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

        {/* Stats Row. No "Secured" tile: every document and study is
            private storage, so it would always equal Total. */}
        {stats.total > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            <Card className="card-sanctuary">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted font-body">Total</p>
                    <p className="text-xl font-bold text-foreground font-display">{stats.total}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-sanctuary">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <FolderOpen className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted font-body">Filtered</p>
                    <p className="text-xl font-bold text-foreground font-display">{stats.filtered}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="card-sanctuary">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/10 flex items-center justify-center">
                    <Leaf className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted font-body">This Month</p>
                    <p className="text-xl font-bold text-foreground font-display">{stats.thisMonth}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Imaging studies — a DICOM series collapses into one card here,
            never into the ordinary document grid below. */}
        {studiesLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
            {Array.from({ length: 2 }).map((_, i) => (
              <Card key={i} className="card-sanctuary">
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          filteredStudies.length > 0 && (
            <div className="mb-10">
              <h2 className="text-2xl font-semibold text-foreground mb-4 font-display">
                Studies
              </h2>
              <div
                className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
                data-testid="studies-grid"
              >
                {filteredStudies.map((study) => (
                  <StudyCard key={study.studyInstanceUid} study={study} />
                ))}
              </div>
            </div>
          )
        )}

        {/* Documents Grid */}
        {documentsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="card-sanctuary">
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
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-4 font-display">
              Documents
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="documents-grid">
              {filteredDocuments.map((document) => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </div>
        ) : plainDocuments.length > 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-light to-secondary/10 flex items-center justify-center mx-auto mb-6">
              <Search className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-3 font-display">No documents found</h3>
            <p className="text-foreground-muted mb-6 max-w-sm mx-auto font-body">
              Try adjusting your search or filter criteria to find what you're looking for
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setFilterType("all");
              }}
              className="border-border text-foreground hover:bg-surface-1"
              data-testid="button-clear-filters"
            >
              <span className="font-body">Clear filters</span>
            </Button>
          </div>
        ) : studyList.length > 0 ? null : (
          <div className="text-center py-16">
            {/* Empty state with vault illustration */}
            <div className="relative w-32 h-32 mx-auto mb-8">
              {/* Vault door rings */}
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div className="absolute inset-4 rounded-full border-4 border-primary/30"></div>
              <div className="absolute inset-8 rounded-full border-4 border-primary/40 flex items-center justify-center">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Shield className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>

            <h3 className="text-3xl font-bold text-foreground mb-4 font-display">Your vault awaits</h3>
            <p className="text-xl text-foreground-muted mb-8 max-w-2xl mx-auto leading-relaxed font-body">
              Start building your secure health archive. Upload your first medical document and keep all your health records in one protected place.
            </p>
            <Button
              onClick={() => {
                analytics.ctaClicked('upload_first_document', 'documents_empty_state');
                setIsUploadOpen(true);
              }}
              className="btn-sanctuary text-lg px-8 py-6"
              data-testid="button-upload-first-document"
            >
              <Plus className="mr-2 h-5 w-5" />
              <span className="font-body">Upload Your First Document</span>
            </Button>
            <div className="flex items-center justify-center flex-wrap gap-6 mt-8 text-foreground-muted">
              <div className="flex items-center space-x-2">
                <Shield className="h-4 w-4 text-primary" />
                <span className="text-sm font-body">Private to your account</span>
              </div>
              <div className="flex items-center space-x-2">
                <Leaf className="h-4 w-4 text-primary" />
                <span className="text-sm font-body">Easy organization</span>
              </div>
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4 text-primary" />
                <span className="text-sm font-body">Always accessible</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <UploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
      />
      <CaseShareDialog
        open={isCaseShareOpen}
        onOpenChange={setIsCaseShareOpen}
      />
    </div>
  );
}
