import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Calendar, 
  Upload, 
  Share2, 
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import type { MedicalDocument } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();

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

  const { data: recentDocuments, isLoading: documentsLoading } = useQuery<MedicalDocument[]>({
    queryKey: ["/api/documents", { limit: 5 }],
    enabled: isAuthenticated,
  });

  const { data: allDocuments } = useQuery<MedicalDocument[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-clean-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-8 w-16" />
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

  const totalDocuments = allDocuments?.length || 0;
  const documentsThisMonth = allDocuments?.filter(doc => {
    const docDate = new Date(doc.createdAt);
    const now = new Date();
    return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
  }).length || 0;

  const documentTypes = allDocuments?.reduce((acc, doc) => {
    acc[doc.documentType] = (acc[doc.documentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const mostCommonType = Object.keys(documentTypes).reduce((a, b) => 
    documentTypes[a] > documentTypes[b] ? a : b, 'lab_result'
  );

  return (
    <div className="min-h-screen bg-clean-white">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-professional-dark mb-2">
            Welcome back, {user?.firstName || 'Patient'}!
          </h1>
          <p className="text-gray-600">
            Here's an overview of your medical records and health data.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Records</p>
                  <p className="text-2xl font-bold text-professional-dark">{totalDocuments}</p>
                </div>
                <div className="w-12 h-12 bg-medical-blue bg-opacity-10 rounded-xl flex items-center justify-center">
                  <FileText className="text-medical-blue h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">This Month</p>
                  <p className="text-2xl font-bold text-professional-dark">{documentsThisMonth}</p>
                </div>
                <div className="w-12 h-12 bg-health-green bg-opacity-10 rounded-xl flex items-center justify-center">
                  <TrendingUp className="text-health-green h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Most Common</p>
                  <p className="text-sm font-semibold text-professional-dark capitalize">
                    {mostCommonType.replace('_', ' ')}
                  </p>
                </div>
                <div className="w-12 h-12 bg-trust-purple bg-opacity-10 rounded-xl flex items-center justify-center">
                  <Calendar className="text-trust-purple h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Last Upload</p>
                  <p className="text-sm font-semibold text-professional-dark">
                    {recentDocuments?.[0] 
                      ? format(new Date(recentDocuments[0].createdAt), 'MMM d')
                      : 'No uploads'
                    }
                  </p>
                </div>
                <div className="w-12 h-12 bg-warm-amber bg-opacity-10 rounded-xl flex items-center justify-center">
                  <Clock className="text-warm-amber h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Records */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-professional-dark">
                    Recent Records
                  </CardTitle>
                  <Button variant="ghost" asChild>
                    <Link href="/documents" className="text-medical-blue hover:text-blue-700 font-medium">
                      View All
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-4">
                        <Skeleton className="w-10 h-10 rounded-lg" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="w-16 h-6 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : recentDocuments && recentDocuments.length > 0 ? (
                  <div className="space-y-4">
                    {recentDocuments.map((document) => (
                      <div key={document.id} className="flex items-center p-4 bg-clean-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow duration-200">
                        <div className="w-10 h-10 bg-medical-blue bg-opacity-10 rounded-lg flex items-center justify-center mr-4">
                          <FileText className="text-medical-blue h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-professional-dark">{document.title}</h5>
                          <p className="text-sm text-gray-600">
                            {document.doctorName ? `${document.doctorName} • ` : ''}
                            {format(new Date(document.documentDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                          document.documentType === 'lab_result' 
                            ? 'bg-health-green bg-opacity-10 text-health-green'
                            : document.documentType === 'prescription'
                            ? 'bg-warm-amber bg-opacity-10 text-warm-amber'
                            : 'bg-trust-purple bg-opacity-10 text-trust-purple'
                        }`}>
                          {document.documentType.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-600 mb-2">No medical records yet</h3>
                    <p className="text-gray-500 mb-4">Upload your first document to get started</p>
                    <Button asChild>
                      <Link href="/documents" className="bg-medical-blue text-white hover:bg-blue-700">
                        <Plus className="mr-2 h-4 w-4" />
                        Upload Document
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-professional-dark">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button asChild className="w-full bg-medical-blue text-white hover:bg-blue-700">
                  <Link href="/documents">
                    <Plus className="mr-2 h-4 w-4" />
                    Upload New Record
                  </Link>
                </Button>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/symptoms">
                    <Activity className="mr-2 h-4 w-4 text-trust-purple" />
                    Log Symptoms
                  </Link>
                </Button>
                <Button variant="outline" className="w-full">
                  <Calendar className="mr-2 h-4 w-4 text-health-green" />
                  Schedule Appointment
                </Button>
              </CardContent>
            </Card>

            {/* Health Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-professional-dark">
                  Health Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-health-green bg-opacity-5 border border-health-green border-opacity-20 rounded-xl">
                  <div className="flex items-center">
                    <CheckCircle className="w-5 h-5 text-health-green mr-3" />
                    <span className="text-sm font-medium text-professional-dark">Records Updated</span>
                  </div>
                  <span className="text-xs text-gray-600">Today</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-warm-amber bg-opacity-5 border border-warm-amber border-opacity-20 rounded-xl">
                  <div className="flex items-center">
                    <Clock className="w-5 h-5 text-warm-amber mr-3" />
                    <span className="text-sm font-medium text-professional-dark">Next Checkup</span>
                  </div>
                  <span className="text-xs text-gray-600">Pending</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
