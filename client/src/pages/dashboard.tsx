import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useDocuments, useSymptoms } from "@/lib/sdk";
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
  Clock,
  Activity,
  ArrowRight,
  Leaf,
  Heart,
  Shield,
  ChevronRight,
  Sun,
  AlertCircle,
  ExternalLink,
  Eye,
  ScanLine
} from "lucide-react";
import { format } from "date-fns";
import type { MedicalDocument, Symptom } from "@shared/schema";
import DicomSeriesViewer from "@/components/dicom-series-viewer";
import { ownedFileUrl } from "@/lib/owned-file";
import { isDicomDocument, localDate } from "@shared/upload-kinds";
import {
  documentItemDate,
  documentItemKey,
  listDocumentItems,
  studyKindCountLabel,
  studyLabel,
  studySeries,
  type DocumentItem,
  type StudyPhaseInfo,
  type StudySummary,
} from "@shared/studies";

/**
 * The dashboard counts, lists and links documents — and a whole imaging
 * study is one document, so nothing below ever reads a series directly.
 */
function itemLabel(item: DocumentItem): string {
  return item.kind === "study" ? studyLabel(item.study) : item.record.title;
}

/**
 * Plan 13: word a study's file count for what its dominant modality's files
 * actually are — "774 slices" for a CT study, "56 views" for an echo study,
 * "3 runs" for a cath study, "10 phases × 580 slices" when the server's
 * phase summary (StudySummary.primaryPhases) confirms a cardiac cycle — instead
 * of the always-generic "N images".
 */
function studySummaryLine(study: StudySummary, phase: StudyPhaseInfo | null): string {
  return [
    study.seriesCount === 1 ? "1 series" : `${study.seriesCount} series`,
    studyKindCountLabel(study, phase, null),
  ].join(" · ");
}

function itemSubtitle(item: DocumentItem): string {
  if (item.kind === "study") {
    return studySummaryLine(item.study, item.study.primaryPhases);
  }
  return item.record.doctorName || item.record.facilityName || "Medical document";
}

/** A study wears its modalities (CT, US, XA…); a document its type. */
function itemBadges(item: DocumentItem): string[] {
  return item.kind === "study"
    ? item.study.modalities
    : [item.record.documentType.replace("_", " ")];
}

/** Most recent upload behind an item — a study is as fresh as its newest series. */
function itemUploadedAt(item: DocumentItem): number {
  const records = item.kind === "study" ? studySeries(item.study) : [item.record];
  return records.reduce((latest, record) => {
    const at = record.createdAt ? new Date(record.createdAt).getTime() : 0;
    return at > latest ? at : latest;
  }, 0);
}

function isInCurrentMonth(date: Date): boolean {
  const now = new Date();
  return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
}

export default function Dashboard() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [appointmentDialogOpen, setAppointmentDialogOpen] = useState(false);
  const [dicomDocument, setDicomDocument] = useState<MedicalDocument | null>(null);
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

  useEffect(() => {
    if (isAuthenticated) {
      analytics.pageVisited('/dashboard');
    }
  }, [isAuthenticated]);

  const { data: allDocuments, isLoading: documentsLoading } = useDocuments(undefined, {
    enabled: isAuthenticated,
  });

  const { data: symptoms } = useSymptoms(undefined, {
    enabled: isAuthenticated,
  });

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

    const daysUntil = Math.ceil((new Date(appointment.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    analytics.appointmentScheduled(appointment.doctor, daysUntil);

    setNewAppointment({ date: "", doctor: "", description: "" });
    setAppointmentDialogOpen(false);
    toast({
      title: "Appointment Scheduled",
      description: "Your appointment has been saved successfully.",
    });
  };

  const removeAppointment = (e: React.MouseEvent, appointmentId: string) => {
    e.stopPropagation();
    const updatedAppointments = appointments.filter(apt => apt.id !== appointmentId);
    setAppointments(updatedAppointments);
    localStorage.setItem(`appointments_${(user as any)?.id}`, JSON.stringify(updatedAppointments));
    analytics.appointmentRemoved();
    toast({
      title: "Appointment Removed",
      description: "The appointment has been removed.",
    });
  };

  // One item per ordinary document and one per study — the single list the
  // tiles, the timeline and the recent rows all read.
  const documentItems = React.useMemo(
    () => listDocumentItems(allDocuments ?? []),
    [allDocuments],
  );


  const recentItems = React.useMemo(() => documentItems.slice(0, 5), [documentItems]);

  const lastActivity = React.useMemo(() => {
    let latest: { item: DocumentItem; at: number } | null = null;
    for (const item of documentItems) {
      const at = itemUploadedAt(item);
      if (at > 0 && (!latest || at > latest.at)) {
        latest = { item, at };
      }
    }
    return latest;
  }, [documentItems]);

  const activityTimeline = React.useMemo(() => {
    const activities: Array<{
      id: string;
      type: 'document' | 'symptom';
      title: string;
      subtitle: string;
      date: Date;
      badges: string[];
      severity?: number;
      item?: DocumentItem;
    }> = [];

    documentItems.forEach(item => {
      activities.push({
        id: documentItemKey(item),
        type: 'document',
        title: itemLabel(item),
        subtitle: itemSubtitle(item),
        // A study is dated by the scan, not by the day it was uploaded.
        date:
          item.kind === 'study'
            ? localDate(item.study.documentDate)
            : item.record.createdAt
              ? new Date(item.record.createdAt)
              : localDate(item.record.documentDate),
        badges: itemBadges(item),
        item,
      });
    });

    symptoms?.forEach(symptom => {
      activities.push({
        id: `sym-${symptom.id}`,
        type: 'symptom',
        title: symptom.symptomName,
        subtitle: symptom.location || symptom.duration || 'Symptom logged',
        date: localDate(symptom.dateRecorded),
        badges: [],
        severity: symptom.severity,
      });
    });

    return activities
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, 8);
  }, [documentItems, symptoms]);

  const symptomStats = React.useMemo(() => {
    if (!symptoms || symptoms.length === 0) return null;

    const avgSeverity = symptoms.reduce((sum, s) => sum + s.severity, 0) / symptoms.length;
    const highSeverityCount = symptoms.filter(s => s.severity >= 7).length;
    const thisMonthCount = symptoms.filter(s => {
      const date = localDate(s.dateRecorded);
      const now = new Date();
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    }).length;

    return { avgSeverity, highSeverityCount, thisMonthCount, total: symptoms.length };
  }, [symptoms]);

  const openDocument = (doc: MedicalDocument) => {
    if (isDicomDocument(doc)) {
      setDicomDocument(doc);
      return;
    }
    window.open(ownedFileUrl(doc.filePath), "_blank");
  };

  // A study opens its study page; a series is never opened from here.
  const handleItemClick = (item: DocumentItem) => {
    if (item.kind === 'study') {
      setLocation(`/studies/${encodeURIComponent(item.study.studyInstanceUid)}`);
      return;
    }
    openDocument(item.record);
  };

  const handleTimelineClick = (activity: typeof activityTimeline[0]) => {
    if (activity.item) {
      handleItemClick(activity.item);
      return;
    }
    setLocation('/symptoms');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navigation />
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Skeleton className="h-10 w-64 mb-4" />
            <Skeleton className="h-5 w-96" />
          </div>
          <div className="grid lg:grid-cols-4 gap-6 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="card-sanctuary">
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

  const totalDocuments = documentItems.length;
  // Dated by the document itself, not by the day it was uploaded.
  const documentsThisMonth = documentItems.filter(item =>
    isInCurrentMonth(localDate(documentItemDate(item))),
  ).length;

  const upcomingAppointments = appointments.filter(apt => new Date(apt.date) > new Date());
  const hasUpcomingAppointment = upcomingAppointments.length > 0;

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard-page">
      <Navigation />

      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary">
              <Sun className="text-white h-5 w-5" />
            </div>
            <div className="badge-sage">
              <span className="font-body">Your Health Sanctuary</span>
            </div>
          </div>
          <h1 className="text-foreground mb-3 font-display">
            {getGreeting()}, {(user as any)?.firstName || 'there'}
          </h1>
          <p className="text-xl text-foreground-muted max-w-2xl font-body">
            Here's an overview of your health journey. Take a moment to check in with yourself.
          </p>
        </div>

        {/* Stats Cards - Now Clickable */}
        <div className="grid lg:grid-cols-4 gap-6 mb-12">
          <Link href="/documents">
            <Card className="card-sanctuary group transition-all duration-300 hover:-translate-y-1 cursor-pointer" data-testid="card-total-records">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-muted mb-1 font-body">Health Records</p>
                    <p
                      className="text-3xl font-bold text-foreground font-display"
                      data-testid="text-total-records"
                    >
                      {totalDocuments}
                    </p>
                    <p className="text-xs text-foreground-subtle mt-1 font-body group-hover:text-primary transition-colors">View all documents →</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <FileText className="text-primary h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/documents">
            <Card className="card-sanctuary group transition-all duration-300 hover:-translate-y-1 cursor-pointer" data-testid="card-this-month">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-muted mb-1 font-body">This Month</p>
                    <p className="text-3xl font-bold text-foreground font-display">{documentsThisMonth}</p>
                    <p className="text-xs text-foreground-subtle mt-1 font-body group-hover:text-primary transition-colors">New additions →</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Leaf className="text-secondary h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Link href="/symptoms">
            <Card className="card-sanctuary group transition-all duration-300 hover:-translate-y-1 cursor-pointer" data-testid="card-symptoms">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-foreground-muted mb-1 font-body">Symptoms Logged</p>
                    <p className="text-3xl font-bold text-foreground font-display">
                      {symptomStats?.total || 0}
                    </p>
                    <p className="text-xs text-foreground-subtle mt-1 font-body group-hover:text-primary transition-colors">Track symptoms →</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Activity className="text-primary h-6 w-6" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          <Card className="card-sanctuary group transition-all duration-300 hover:-translate-y-1" data-testid="card-last-upload">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-foreground-muted mb-1 font-body">Last Activity</p>
                  <p className="text-xl font-bold text-foreground font-display">
                    {lastActivity
                      ? format(new Date(lastActivity.at), 'MMM d')
                      : 'No activity'
                    }
                  </p>
                  <p
                    className="text-xs text-foreground-subtle mt-1 font-body truncate"
                    data-testid="text-last-activity-label"
                  >
                    {lastActivity ? itemLabel(lastActivity.item) : 'Recent update'}
                  </p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <Clock className="text-secondary h-6 w-6" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Health Activity Timeline - Clickable Items */}
        {activityTimeline.length > 0 && (
          <Card className="card-sanctuary mb-8" data-testid="activity-timeline-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-semibold text-foreground mb-1 font-display">
                    Your Health Timeline
                  </CardTitle>
                  <p className="text-sm text-foreground-muted font-body">Click any item to view details</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-[17px] top-0 bottom-0 w-px bg-border" />

                <div className="space-y-2">
                  {activityTimeline.map((activity) => (
                    <div
                      key={activity.id}
                      onClick={() => handleTimelineClick(activity)}
                      className="flex items-start gap-4 relative p-3 -ml-3 rounded-xl cursor-pointer hover:bg-surface-1 transition-all duration-200 group"
                      data-testid={`timeline-item-${activity.id}`}
                    >
                      <div className={`relative z-10 w-9 h-9 rounded-lg flex items-center justify-center transition-transform duration-200 group-hover:scale-110 ${
                        activity.type === 'document'
                          ? 'bg-primary-light'
                          : activity.severity && activity.severity >= 7
                            ? 'bg-rose-100 dark:bg-rose-900/30'
                            : activity.severity && activity.severity >= 4
                              ? 'bg-amber-100 dark:bg-amber-900/30'
                              : 'bg-secondary/10'
                      }`}>
                        {activity.type === 'document' ? (
                          <FileText className="h-4 w-4 text-primary" />
                        ) : (
                          <Activity className={`h-4 w-4 ${
                            activity.severity && activity.severity >= 7 ? 'text-rose-500' :
                            activity.severity && activity.severity >= 4 ? 'text-amber-500' :
                            'text-secondary'
                          }`} />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p
                                className={`font-medium text-foreground font-body truncate ${
                                  activity.type === 'symptom' ? 'capitalize' : ''
                                }`}
                              >
                                {activity.title}
                              </p>
                              {activity.type === 'document' && (
                                <ExternalLink className="h-3 w-3 text-foreground-subtle opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-sm text-foreground-muted font-body truncate">{activity.subtitle}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xs text-foreground-subtle font-body">
                              {format(activity.date, 'MMM d, yyyy')}
                            </p>
                            {activity.badges.map((badge) => (
                              <span
                                key={badge}
                                className="badge-sage mt-1 ml-1 inline-block capitalize text-xs"
                                data-testid={`timeline-badge-${activity.id}`}
                              >
                                {badge}
                              </span>
                            ))}
                            {activity.type === 'symptom' && activity.severity && (
                              <span className={`inline-block mt-1 px-2 py-0.5 text-xs rounded-full font-body ${
                                activity.severity >= 7 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                                activity.severity >= 4 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-primary-light text-primary'
                              }`}>
                                Severity {activity.severity}/10
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <ChevronRight className="h-4 w-4 text-foreground-subtle opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 flex-shrink-0 mt-2.5" />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Recent Records - Clickable Rows */}
          <div className="lg:col-span-2">
            <Card className="card-sanctuary" data-testid="recent-records-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-semibold text-foreground mb-1 font-display">
                      Recent Health Records
                    </CardTitle>
                    <p className="text-sm text-foreground-muted font-body">Click to view document</p>
                  </div>
                  <Button
                    variant="ghost"
                    asChild
                    className="text-primary hover:text-primary hover:bg-primary-light"
                    data-testid="button-view-all-documents"
                    onClick={() => analytics.ctaClicked('view_all_documents', 'dashboard_recent_records')}
                  >
                    <Link href="/documents" className="flex items-center space-x-2 font-body">
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
                      <div key={i} className="flex items-center space-x-4 p-4 bg-surface-1 rounded-xl">
                        <Skeleton className="w-12 h-12 rounded-xl" />
                        <div className="flex-1">
                          <Skeleton className="h-4 w-3/4 mb-2" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="w-20 h-6 rounded-full" />
                      </div>
                    ))}
                  </div>
                ) : recentItems.length > 0 ? (
                  <div className="space-y-3">
                    {recentItems.map((item) => (
                      <div
                        key={documentItemKey(item)}
                        onClick={() => handleItemClick(item)}
                        className="flex items-center p-4 bg-surface-1 rounded-xl border border-border hover:border-primary hover:bg-primary-light/30 transition-all duration-200 cursor-pointer group"
                        data-testid={`recent-${documentItemKey(item)}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && handleItemClick(item)}
                      >
                        <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center mr-4 group-hover:scale-110 transition-transform duration-200">
                          {item.kind === 'study' ? (
                            <ScanLine className="text-primary h-5 w-5" />
                          ) : (
                            <FileText className="text-primary h-5 w-5" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className="font-medium text-foreground mb-1 font-body truncate">{itemLabel(item)}</h5>
                          <p className="text-sm text-foreground-muted font-body truncate">
                            {item.kind === 'study'
                              ? `${itemSubtitle(item)} • `
                              : item.record.doctorName
                                ? `${item.record.doctorName} • `
                                : ''}
                            {format(localDate(documentItemDate(item)), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 flex-shrink-0">
                          {itemBadges(item).map((badge) => (
                            <span key={badge} className="badge-sage capitalize hidden sm:inline-block">
                              {badge}
                            </span>
                          ))}
                          <div className="flex items-center space-x-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                            <Eye className="h-4 w-4" />
                            <span className="text-xs font-medium font-body">View</span>
                          </div>
                          <ChevronRight className="h-4 w-4 text-foreground-subtle group-hover:text-primary group-hover:translate-x-1 transition-all duration-200" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-light to-secondary/10 flex items-center justify-center mx-auto mb-6">
                      <FileText className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2 font-display">Start your health journey</h3>
                    <p className="text-foreground-muted mb-6 max-w-sm mx-auto font-body">Upload your first document to begin building your personal health sanctuary</p>
                    <Button
                      asChild
                      className="btn-sanctuary"
                      data-testid="button-upload-first-document"
                      onClick={() => analytics.ctaClicked('upload_first_document', 'dashboard_empty_state')}
                    >
                      <Link href="/documents" className="flex items-center space-x-2">
                        <Upload className="h-4 w-4" />
                        <span className="font-body">Upload First Document</span>
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Appointments */}
            <Card className="card-sanctuary" data-testid="appointments-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold text-foreground mb-1 font-display">
                      Upcoming Care
                    </CardTitle>
                    <p className="text-xs text-foreground-muted font-body">Your scheduled appointments</p>
                  </div>
                  <Dialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="h-8 w-8 rounded-xl hover:bg-primary-light" data-testid="button-add-appointment">
                        <Plus className="h-4 w-4 text-primary" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-card border-border">
                      <DialogHeader>
                        <DialogTitle className="text-foreground font-display">Schedule Appointment</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="appointment-date" className="text-foreground font-body">Date & Time</Label>
                          <Input
                            id="appointment-date"
                            type="datetime-local"
                            value={newAppointment.date}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, date: e.target.value }))}
                            className="input-sanctuary"
                          />
                        </div>
                        <div>
                          <Label htmlFor="doctor-name" className="text-foreground font-body">Doctor Name</Label>
                          <Input
                            id="doctor-name"
                            placeholder="Dr. Smith"
                            value={newAppointment.doctor}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, doctor: e.target.value }))}
                            className="input-sanctuary"
                          />
                        </div>
                        <div>
                          <Label htmlFor="appointment-description" className="text-foreground font-body">Notes (Optional)</Label>
                          <Textarea
                            id="appointment-description"
                            placeholder="Annual checkup, follow-up visit, etc."
                            value={newAppointment.description}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, description: e.target.value }))}
                            className="input-sanctuary resize-none"
                          />
                        </div>
                        <div className="flex gap-3 pt-2">
                          <Button onClick={saveAppointment} className="btn-sanctuary flex-1" data-testid="button-save-appointment">
                            Save Appointment
                          </Button>
                          <Button variant="outline" onClick={() => setAppointmentDialogOpen(false)} className="border-border text-foreground hover:bg-surface-1" data-testid="button-cancel-appointment">
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
                        <div key={appointment.id} className={`p-4 rounded-xl border-l-4 transition-all duration-200 hover:shadow-md ${
                          isAptSoon
                            ? 'bg-amber-50 border-amber-400 dark:bg-amber-900/10 hover:bg-amber-100 dark:hover:bg-amber-900/20'
                            : 'bg-primary-light border-primary hover:bg-primary-light/70'
                        }`} data-testid={`appointment-${appointment.id}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h6 className="font-medium text-foreground mb-1 font-body">{appointment.doctor}</h6>
                              <p className="text-sm text-foreground-muted mb-1 font-body">
                                {format(aptDate, 'MMM d, yyyy • h:mm a')}
                              </p>
                              {appointment.description && (
                                <p className="text-sm text-foreground mt-1 font-body">{appointment.description}</p>
                              )}
                              {isAptSoon && (
                                <div className="flex items-center space-x-1 mt-2">
                                  <AlertCircle className="h-3 w-3 text-amber-500" />
                                  <p className="text-xs text-amber-600 font-medium font-body">Coming up soon</p>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center space-x-2">
                              <Calendar className={`h-4 w-4 ${isAptSoon ? 'text-amber-500' : 'text-primary'}`} />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => removeAppointment(e, appointment.id)}
                                className="h-6 w-6 p-0 text-foreground-muted hover:text-destructive hover:bg-destructive/10 rounded-full"
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
                      <p className="text-xs text-foreground-muted text-center pt-2 font-body">
                        +{upcomingAppointments.length - 3} more appointments
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mx-auto mb-4">
                      <Calendar className="w-6 h-6 text-secondary" />
                    </div>
                    <p className="text-sm text-foreground mb-2 font-body">No upcoming appointments</p>
                    <p className="text-xs text-foreground-muted mb-4 font-body">Schedule your next visit to stay on track</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setAppointmentDialogOpen(true)}
                      className="border-border text-foreground hover:bg-surface-1"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      <span className="font-body">Add Appointment</span>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Symptom Summary - Clickable */}
            <Link href="/symptoms">
              <Card className="card-sanctuary cursor-pointer hover:border-primary transition-all duration-200 group" data-testid="symptom-summary-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold text-foreground mb-1 font-display">
                        Symptom Overview
                      </CardTitle>
                      <p className="text-xs text-foreground-muted font-body group-hover:text-primary transition-colors">Click to manage symptoms →</p>
                    </div>
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Activity className="h-4 w-4 text-secondary" />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {symptomStats ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-surface-1 rounded-xl border border-border group-hover:border-primary/30 transition-colors">
                          <p className="text-2xl font-bold text-foreground font-display">{symptomStats.total}</p>
                          <p className="text-xs text-foreground-muted font-body">Total logged</p>
                        </div>
                        <div className="p-3 bg-surface-1 rounded-xl border border-border group-hover:border-primary/30 transition-colors">
                          <p className="text-2xl font-bold text-foreground font-display">{symptomStats.thisMonthCount}</p>
                          <p className="text-xs text-foreground-muted font-body">This month</p>
                        </div>
                        <div className="p-3 bg-surface-1 rounded-xl border border-border group-hover:border-primary/30 transition-colors">
                          <p className={`text-2xl font-bold font-display ${
                            symptomStats.avgSeverity >= 7 ? 'text-rose-500' :
                            symptomStats.avgSeverity >= 4 ? 'text-amber-500' :
                            'text-primary'
                          }`}>{symptomStats.avgSeverity.toFixed(1)}</p>
                          <p className="text-xs text-foreground-muted font-body">Avg severity</p>
                        </div>
                        <div className="p-3 bg-surface-1 rounded-xl border border-border group-hover:border-primary/30 transition-colors">
                          <p className={`text-2xl font-bold font-display ${symptomStats.highSeverityCount > 0 ? 'text-rose-500' : 'text-primary'}`}>
                            {symptomStats.highSeverityCount}
                          </p>
                          <p className="text-xs text-foreground-muted font-body">High severity</p>
                        </div>
                      </div>
                      {symptomStats.highSeverityCount > 0 && (
                        <div className="mt-3 p-2 bg-rose-50 rounded-lg border border-rose-200 dark:bg-rose-900/10 dark:border-rose-800">
                          <p className="text-xs text-rose-600 dark:text-rose-400 font-body">
                            <AlertCircle className="h-3 w-3 inline mr-1" />
                            {symptomStats.highSeverityCount} symptom(s) with severity 7+
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-foreground-muted font-body">No symptoms logged yet</p>
                      <p className="text-xs text-foreground-subtle font-body mt-1">Start tracking to see patterns</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>

            {/* Quick Actions */}
            <Card className="card-sanctuary" data-testid="quick-actions-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-foreground font-display">
                  Quick Actions
                </CardTitle>
                <p className="text-xs text-foreground-muted font-body">Fast access to key features</p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    asChild
                    className="w-full btn-sanctuary justify-start group"
                    data-testid="button-upload-document"
                    onClick={() => analytics.ctaClicked('upload_document', 'dashboard_quick_actions')}
                  >
                    <Link href="/documents" className="flex items-center space-x-3">
                      <div className="p-1.5 rounded-lg bg-white/20">
                        <Upload className="h-4 w-4" />
                      </div>
                      <span className="font-body">Upload Document</span>
                      <ArrowRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="w-full justify-start border-border text-foreground hover:bg-surface-1 hover:border-primary group"
                    data-testid="button-track-symptoms"
                    onClick={() => analytics.ctaClicked('track_symptoms', 'dashboard_quick_actions')}
                  >
                    <Link href="/symptoms" className="flex items-center space-x-3">
                      <div className="p-1.5 rounded-lg border border-border group-hover:border-primary/50 transition-colors">
                        <Activity className="h-4 w-4 text-secondary" />
                      </div>
                      <span className="font-body">Track Symptoms</span>
                      <ArrowRight className="ml-auto h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Wellness Tip */}
            <Card className="card-vault" data-testid="health-tips-card">
              <CardContent className="p-4">
                <div className="flex items-start space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center flex-shrink-0">
                    <Heart className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground mb-1 font-body">
                      {totalDocuments === 0
                        ? "Start your health journey"
                        : symptomStats && symptomStats.thisMonthCount === 0
                          ? "Track symptoms regularly"
                          : lastActivity && (Date.now() - lastActivity.at > 30 * 24 * 60 * 60 * 1000)
                            ? "Keep your records updated"
                            : "You're on track!"
                      }
                    </p>
                    <p className="text-xs text-foreground-muted font-body">
                      {totalDocuments === 0
                        ? "Upload your first medical document to begin building your health profile."
                        : symptomStats && symptomStats.thisMonthCount === 0
                          ? "Logging symptoms helps identify patterns and triggers over time."
                          : lastActivity && (Date.now() - lastActivity.at > 30 * 24 * 60 * 60 * 1000)
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
      <DicomSeriesViewer
        document={dicomDocument}
        open={dicomDocument !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDicomDocument(null);
          }
        }}
      />
    </div>
  );
}
