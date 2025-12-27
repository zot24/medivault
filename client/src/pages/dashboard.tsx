import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import analytics from "@/lib/analytics/umami";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  FileText, 
  Calendar, 
  Upload, 
  Plus,
  TrendingUp,
  Clock,
  CheckCircle,
  Activity,
  Brain,
  Sparkles,
  ArrowRight,
  BarChart3,
  Zap,
  FileImage,
  HeartHandshake,
  ChevronRight
} from "lucide-react";
import { format } from "date-fns";
import type { MedicalDocument, Symptom } from "@shared/schema";

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [appointments, setAppointments] = useState<Array<{
    id: string;
    date: string;
    doctor: string;
    description: string;
  }>>([]);
  const [newAppointment, setNewAppointment] = useState({
    date: "",
    doctor: "",
    description: ""
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to view the dashboard.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  // Track page visit
  useEffect(() => {
    if (isAuthenticated) {
      analytics.pageVisited('/dashboard');
    }
  }, [isAuthenticated]);

  const { data: allDocuments, isLoading: documentsLoading } = useQuery<MedicalDocument[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
  });

  const { data: symptoms } = useQuery<Symptom[]>({
    queryKey: ["/api/symptoms"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Load stored appointments data
  useEffect(() => {
    if ((user as any)?.id) {
      const stored = localStorage.getItem(`appointments_${(user as any).id}`);
      if (stored) {
        setAppointments(JSON.parse(stored));
      }
    }
  }, [(user as any)?.id]);

  const saveAppointment = () => {
    if (!newAppointment.date || !newAppointment.doctor) {
      toast({
        title: "Missing Information",
        description: "Please fill in the appointment date and doctor name.",
        variant: "destructive",
      });
      return;
    }

    const appointment = {
      id: Date.now().toString(),
      ...newAppointment
    };

    const updatedAppointments = [...appointments, appointment].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    setAppointments(updatedAppointments);
    localStorage.setItem(`appointments_${(user as any)?.id}`, JSON.stringify(updatedAppointments));

    // Track appointment scheduling
    const daysUntil = Math.ceil((new Date(appointment.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    analytics.appointmentScheduled(appointment.doctor, daysUntil);

    setNewAppointment({ date: "", doctor: "", description: "" });
    setAppointmentDialogOpen(false);
    toast({
      title: "Appointment Scheduled",
      description: "Your appointment has been saved successfully.",
    });
  };

  const removeAppointment = (appointmentId: string) => {
    const updatedAppointments = appointments.filter(apt => apt.id !== appointmentId);
    setAppointments(updatedAppointments);
    localStorage.setItem(`appointments_${(user as any)?.id}`, JSON.stringify(updatedAppointments));

    // Track appointment removal
    analytics.appointmentRemoved();

    toast({
      title: "Appointment Removed",
      description: "The appointment has been removed.",
    });
  };

  // Memoize computed values for better performance
  const recentDocuments = React.useMemo(() => {
    if (!allDocuments) return undefined;
    // Sort by createdAt descending and take first 5
    return [...allDocuments]
      .sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      })
      .slice(0, 5);
  }, [allDocuments]);

  const lastUploadDate = React.useMemo(() => {
    if (!allDocuments || allDocuments.length === 0) return null;
    const sortedDocs = [...allDocuments]
      .filter(doc => doc.createdAt)
      .sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
    return sortedDocs[0]?.createdAt || null;
  }, [allDocuments]);

  // Combined health activity timeline
  const activityTimeline = React.useMemo(() => {
    const activities: Array<{
      id: string;
      type: 'document' | 'symptom';
      title: string;
      subtitle: string;
      date: Date;
      severity?: number;
      documentType?: string;
    }> = [];

    // Add documents
    allDocuments?.forEach(doc => {
      activities.push({
        id: `doc-${doc.id}`,
        type: 'document',
        title: doc.title,
        subtitle: doc.doctorName || doc.facilityName || 'Medical document',
        date: new Date(doc.createdAt || doc.documentDate),
        documentType: doc.documentType,
      });
    });

    // Add symptoms
    symptoms?.forEach(symptom => {
      activities.push({
        id: `sym-${symptom.id}`,
        type: 'symptom',
        title: symptom.symptomName,
        subtitle: symptom.location || symptom.duration || 'Symptom logged',
        date: new Date(symptom.dateRecorded),
        severity: symptom.severity,
      });
    });

    // Sort by date descending and take first 8
    return activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);
  }, [allDocuments, symptoms]);

  // Symptom stats
  const symptomStats = React.useMemo(() => {
    if (!symptoms || symptoms.length === 0) return null;

    const avgSeverity = symptoms.reduce((sum, s) => sum + s.severity, 0) / symptoms.length;
    const highSeverityCount = symptoms.filter(s => s.severity >= 7).length;
    const thisMonthCount = symptoms.filter(s => {
      const date = new Date(s.dateRecorded);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    return { avgSeverity, highSeverityCount, thisMonthCount, total: symptoms.length };
  }, [symptoms]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Skeleton className="h-8 w-64 mb-4" />
            <Skeleton className="h-4 w-96" />
          </div>
          <div className="grid lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="bg-surface-1 border-white/10">
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
    if (!doc.createdAt) return false;
    const docDate = new Date(doc.createdAt);
    const now = new Date();
    return docDate.getMonth() === now.getMonth() && docDate.getFullYear() === now.getFullYear();
  }).length || 0;

  const documentTypes = allDocuments?.reduce((acc, doc) => {
    acc[doc.documentType] = (acc[doc.documentType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const mostCommonType = Object.keys(documentTypes).length > 0 
    ? Object.keys(documentTypes).reduce((a, b) => 
        documentTypes[a] > documentTypes[b] ? a : b
      )
    : null;

  const upcomingAppointments = appointments.filter(apt => new Date(apt.date) > new Date());
  const nextAppointment = upcomingAppointments[0];
  const hasUpcomingAppointment = upcomingAppointments.length > 0;
  const appointmentDate = hasUpcomingAppointment ? new Date(nextAppointment.date) : null;
  const isAppointmentSoon = appointmentDate && appointmentDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary">
              <Brain className="text-white h-5 w-5" />
            </div>
            <div className="inline-flex items-center space-x-2 bg-surface-1 border border-white/10 rounded-full px-3 py-1 text-xs text-foreground-muted">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>AI-Powered Health Intelligence</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-3">
            Welcome back, {(user as any)?.firstName || 'there'}!
          </h1>
          <p className="text-xl text-foreground-muted max-w-2xl">
            Your personalized health dashboard analyzing patterns across all your medical data to deliver intelligent insights.
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid lg:grid-cols-4 gap-6 mb-12">
          <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid="card-total-records">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Health Records</p>
                  <p className="text-3xl font-bold text-foreground">{totalDocuments}</p>
                  <p className="text-xs text-foreground-muted mt-1">Documents analyzed</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-primary/70 group-hover:scale-110 transition-transform duration-300">
                  <FileText className="text-white h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid="card-this-month">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-muted mb-1">This Month</p>
                  <p className="text-3xl font-bold text-foreground">{documentsThisMonth}</p>
                  <p className="text-xs text-foreground-muted mt-1">New uploads</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-secondary to-secondary/70 group-hover:scale-110 transition-transform duration-300">
                  <TrendingUp className="text-white h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid="card-common-type">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Most Common</p>
                  <p className="text-xl font-bold text-foreground capitalize">
                    {mostCommonType ? mostCommonType.replace('_', ' ') : '—'}
                  </p>
                  <p className="text-xs text-foreground-muted mt-1">Document type</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-accent to-accent/70 group-hover:scale-110 transition-transform duration-300">
                  <BarChart3 className="text-white h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid="card-last-upload">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-muted mb-1">Last Upload</p>
                  <p className="text-xl font-bold text-foreground">
                    {lastUploadDate
                      ? format(new Date(lastUploadDate), 'MMM d')
                      : 'No uploads'
                    }
                  </p>
                  <p className="text-xs text-foreground-muted mt-1">Recent activity</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-primary to-secondary group-hover:scale-110 transition-transform duration-300">
                  <Clock className="text-white h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Health Activity Timeline */}
        {activityTimeline.length > 0 && (
          <Card className="bg-surface-1 border-white/10 mb-8" data-testid="activity-timeline-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold text-foreground mb-1">
                    Health Activity Timeline
                  </CardTitle>
                  <p className="text-sm text-foreground-muted">Your recent health journey at a glance</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[17px] top-0 bottom-0 w-px bg-white/10" />

                <div className="space-y-4">
                  {activityTimeline.map((activity, index) => (
                    <div key={activity.id} className="flex items-start gap-4 relative">
                      {/* Timeline dot */}
                      <div className={`relative z-10 p-2 rounded-lg ${
                        activity.type === 'document'
                          ? 'bg-gradient-to-br from-primary to-primary/70'
                          : activity.severity && activity.severity >= 7
                            ? 'bg-gradient-to-br from-red-500 to-red-600'
                            : activity.severity && activity.severity >= 4
                              ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                              : 'bg-gradient-to-br from-secondary to-accent'
                      }`}>
                        {activity.type === 'document' ? (
                          <FileText className="h-4 w-4 text-white" />
                        ) : (
                          <Activity className="h-4 w-4 text-white" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 pb-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-foreground capitalize">{activity.title}</p>
                            <p className="text-sm text-foreground-muted">{activity.subtitle}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-foreground-muted">
                              {format(activity.date, 'MMM d, yyyy')}
                            </p>
                            {activity.type === 'document' && activity.documentType && (
                              <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-white/10 text-foreground-muted rounded-full capitalize">
                                {activity.documentType.replace('_', ' ')}
                              </span>
                            )}
                            {activity.type === 'symptom' && activity.severity && (
                              <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full ${
                                activity.severity >= 7 ? 'bg-red-500/20 text-red-400' :
                                activity.severity >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-green-500/20 text-green-400'
                              }`}>
                                Severity {activity.severity}/10
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Records */}
          <div className="lg:col-span-2">
            <Card className="bg-surface-1 border-white/10" data-testid="recent-records-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-semibold text-foreground mb-1">
                      Recent Health Records
                    </CardTitle>
                    <p className="text-sm text-foreground-muted">AI-analyzed documents from your health journey</p>
                  </div>
                  <Button
                    variant="ghost"
                    asChild
                    className="text-primary hover:text-primary hover:bg-white/5"
                    data-testid="button-view-all-documents"
                    onClick={() => analytics.ctaClicked('view_all_documents', 'dashboard_recent_records')}
                  >
                    <Link href="/documents" className="flex items-center space-x-2">
                      <span>View All</span>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-4 bg-surface-2 rounded-xl">
                        <Skeleton className="w-12 h-12 rounded-xl" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="w-20 h-6 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : recentDocuments && recentDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {recentDocuments.map((document) => (
                      <div key={document.id} className="flex items-center p-4 bg-surface-2 rounded-xl border border-white/5 hover:bg-surface-3 transition-all duration-200 group" data-testid={`document-${document.id}`}>
                        <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/70 mr-4 group-hover:scale-105 transition-transform duration-200">
                          <FileText className="text-white h-5 w-5" />
                        </div>
                        <div className="flex-1">
                          <h5 className="font-medium text-foreground mb-1">{document.title}</h5>
                          <p className="text-sm text-foreground-muted">
                            {document.doctorName ? `${document.doctorName} • ` : ''}
                            {format(new Date(document.documentDate), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="px-3 py-1 text-xs font-medium bg-white/10 text-foreground-muted rounded-full capitalize border border-white/10">
                            {document.documentType.replace('_', ' ')}
                          </span>
                          <ChevronRight className="h-4 w-4 text-foreground-muted group-hover:translate-x-1 transition-transform duration-200" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 w-fit mx-auto mb-6">
                      <FileImage className="w-12 h-12 text-primary mx-auto" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">Ready to unlock health insights?</h3>
                    <p className="text-foreground-muted mb-6 max-w-sm mx-auto">Upload your first document and watch our AI analyze patterns in your health data</p>
                    <Button
                      asChild
                      className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90"
                      data-testid="button-upload-first-document"
                      onClick={() => analytics.ctaClicked('upload_first_document', 'dashboard_empty_state')}
                    >
                      <Link href="/documents" className="flex items-center space-x-2">
                        <Upload className="h-4 w-4" />
                        <span>Upload First Document</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Next Appointment */}
            <Card className="bg-surface-1 border-white/10" data-testid="appointments-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-foreground mb-1">
                      Upcoming Appointments
                    </CardTitle>
                    <p className="text-xs text-foreground-muted">Stay on track with your care plan</p>
                  </div>
                  <Dialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 rounded-xl hover:bg-white/10" data-testid="button-add-appointment">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-surface-1 border-white/20">
                      <DialogHeader>
                        <DialogTitle className="text-foreground">Schedule Appointment</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="appointment-date" className="text-foreground">Date & Time</Label>
                          <Input
                            id="appointment-date"
                            type="datetime-local"
                            value={newAppointment.date}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, date: e.target.value }))}
                            className="bg-surface-2 border-white/20 text-foreground"
                          />
                        </div>
                        <div>
                          <Label htmlFor="doctor-name" className="text-foreground">Doctor Name</Label>
                          <Input
                            id="doctor-name"
                            placeholder="Dr. Smith"
                            value={newAppointment.doctor}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, doctor: e.target.value }))}
                            className="bg-surface-2 border-white/20 text-foreground"
                          />
                        </div>
                        <div>
                          <Label htmlFor="appointment-description" className="text-foreground">Description (Optional)</Label>
                          <Textarea
                            id="appointment-description"
                            placeholder="Annual checkup, follow-up visit, etc."
                            value={newAppointment.description}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, description: e.target.value }))}
                            className="bg-surface-2 border-white/20 text-foreground"
                          />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <Button onClick={saveAppointment} className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 flex-1" data-testid="button-save-appointment">
                            Save Appointment
                          </Button>
                          <Button variant="outline" onClick={() => setAppointmentDialogOpen(false)} className="border-white/20 text-foreground hover:bg-white/5" data-testid="button-cancel-appointment">
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {hasUpcomingAppointment ? (
                  <div className="space-y-3">
                    {upcomingAppointments.slice(0, 3).map((appointment) => {
                      const aptDate = new Date(appointment.date);
                      const isAptSoon = aptDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;
                      return (
                        <div key={appointment.id} className={`p-4 rounded-xl border-l-4 ${
                          isAptSoon 
                            ? 'bg-gradient-to-r from-orange-500/10 to-transparent border-orange-400' 
                            : 'bg-gradient-to-r from-primary/10 to-transparent border-primary'
                        }`} data-testid={`appointment-${appointment.id}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h6 className="font-medium text-foreground mb-1">{appointment.doctor}</h6>
                              <p className="text-sm text-foreground-muted mb-1">
                                {format(aptDate, 'MMM d, yyyy • h:mm a')}
                              </p>
                              {appointment.description && (
                                <p className="text-sm text-foreground mt-1">{appointment.description}</p>
                              )}
                              {isAptSoon && (
                                <div className="flex items-center space-x-1 mt-2">
                                  <Zap className="h-3 w-3 text-orange-400" />
                                  <p className="text-xs text-orange-400 font-medium">Upcoming within 7 days</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Calendar className={`h-4 w-4 ${isAptSoon ? 'text-orange-400' : 'text-primary'}`} />
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => removeAppointment(appointment.id)}
                                className="h-6 w-6 p-0 text-foreground-muted hover:text-destructive hover:bg-destructive/10"
                                data-testid={`button-remove-appointment-${appointment.id}`}
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {upcomingAppointments.length > 3 && (
                      <p className="text-xs text-foreground-muted text-center pt-2">
                        +{upcomingAppointments.length - 3} more appointments
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-secondary/10 to-accent/10 w-fit mx-auto mb-4">
                      <Calendar className="w-8 h-8 text-secondary mx-auto" />
                    </div>
                    <p className="text-sm text-foreground mb-2">No upcoming appointments</p>
                    <p className="text-xs text-foreground-muted">Schedule your next visit to stay on track</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Symptom Summary */}
            {symptomStats && (
              <Card className="bg-surface-1 border-white/10" data-testid="symptom-summary-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-foreground mb-1">
                        Symptom Overview
                      </CardTitle>
                      <p className="text-xs text-foreground-muted">Patterns in your health tracking</p>
                    </div>
                    <Button
                      variant="ghost"
                      asChild
                      size="sm"
                      className="text-secondary hover:text-secondary hover:bg-white/5"
                    >
                      <Link href="/symptoms" className="flex items-center space-x-1">
                        <span className="text-xs">View All</span>
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-surface-2 rounded-xl border border-white/5">
                      <p className="text-2xl font-bold text-foreground">{symptomStats.total}</p>
                      <p className="text-xs text-foreground-muted">Total logged</p>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl border border-white/5">
                      <p className="text-2xl font-bold text-foreground">{symptomStats.thisMonthCount}</p>
                      <p className="text-xs text-foreground-muted">This month</p>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl border border-white/5">
                      <p className={`text-2xl font-bold ${
                        symptomStats.avgSeverity >= 7 ? 'text-red-400' :
                        symptomStats.avgSeverity >= 4 ? 'text-yellow-400' :
                        'text-green-400'
                      }`}>{symptomStats.avgSeverity.toFixed(1)}</p>
                      <p className="text-xs text-foreground-muted">Avg severity</p>
                    </div>
                    <div className="p-3 bg-surface-2 rounded-xl border border-white/5">
                      <p className={`text-2xl font-bold ${symptomStats.highSeverityCount > 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {symptomStats.highSeverityCount}
                      </p>
                      <p className="text-xs text-foreground-muted">High severity</p>
                    </div>
                  </div>
                  {symptomStats.highSeverityCount > 0 && (
                    <div className="mt-3 p-2 bg-red-500/10 rounded-lg border border-red-500/20">
                      <p className="text-xs text-red-400">
                        <Zap className="h-3 w-3 inline mr-1" />
                        {symptomStats.highSeverityCount} symptom(s) logged with severity 7+
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card className="bg-surface-1 border-white/10" data-testid="quick-actions-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground">
                  Quick Actions
                </CardTitle>
                <p className="text-xs text-foreground-muted">Fast access to key features</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    asChild
                    className="w-full bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 justify-start group"
                    data-testid="button-upload-document"
                    onClick={() => analytics.ctaClicked('upload_document', 'dashboard_quick_actions')}
                  >
                    <Link href="/documents" className="flex items-center space-x-3">
                      <div className="p-1 rounded bg-white/20">
                        <Upload className="h-4 w-4" />
                      </div>
                      <span>Upload Document</span>
                      <ArrowRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start border-white/20 text-foreground hover:bg-white/5 group"
                    data-testid="button-track-symptoms"
                    onClick={() => analytics.ctaClicked('track_symptoms', 'dashboard_quick_actions')}
                  >
                    <Link href="/symptoms" className="flex items-center space-x-3">
                      <div className="p-1 rounded border border-white/20">
                        <Activity className="h-4 w-4" />
                      </div>
                      <span>Track Symptoms</span>
                      <ArrowRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* AI Insights Preview */}
            <Card className="bg-gradient-to-br from-primary/5 to-secondary/5 border-primary/20" data-testid="ai-insights-card">
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg font-semibold text-foreground">
                    AI Health Insights
                  </CardTitle>
                </div>
                <p className="text-xs text-foreground-muted">Unlock patterns in your health data</p>
              </CardHeader>
              <CardContent>
                {totalDocuments > 0 ? (
                  <div className="space-y-3">
                    <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                      <div className="flex items-center space-x-2 mb-2">
                        <Sparkles className="h-3 w-3 text-primary" />
                        <p className="text-xs font-medium text-primary">Pattern Analysis Ready</p>
                      </div>
                      <p className="text-sm text-foreground">Your health data can reveal trends across {totalDocuments} documents</p>
                    </div>
                    <Button variant="outline" className="w-full border-primary/30 text-primary hover:bg-primary/10" data-testid="button-view-insights">
                      <Brain className="mr-2 h-4 w-4" />
                      View AI Insights
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <HeartHandshake className="h-8 w-8 text-primary mx-auto mb-2" />
                    <p className="text-sm text-foreground-muted">Upload documents to unlock AI insights</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Health Tips / Engagement */}
            <Card className="bg-surface-1 border-white/10" data-testid="health-tips-card">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground mb-1">
                      {totalDocuments === 0
                        ? "Start your health journey"
                        : symptomStats && symptomStats.thisMonthCount === 0
                          ? "Track symptoms regularly"
                          : lastUploadDate && (Date.now() - new Date(lastUploadDate).getTime() > 30 * 24 * 60 * 60 * 1000)
                            ? "Keep your records updated"
                            : "You're on track!"
                      }
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {totalDocuments === 0
                        ? "Upload your first medical document to begin building your health profile."
                        : symptomStats && symptomStats.thisMonthCount === 0
                          ? "Logging symptoms helps identify patterns and triggers over time."
                          : lastUploadDate && (Date.now() - new Date(lastUploadDate).getTime() > 30 * 24 * 60 * 60 * 1000)
                            ? "It's been over 30 days since your last upload. Have any new documents to add?"
                            : "You're staying on top of your health tracking. Keep it up!"
                      }
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}