import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/navigation";
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
  Activity
} from "lucide-react";
import { format } from "date-fns";
import type { MedicalDocument } from "@shared/schema";

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

  const { data: allDocuments, isLoading: documentsLoading } = useQuery<MedicalDocument[]>({
    queryKey: ["/api/documents"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes cache
    refetchOnWindowFocus: false, // Prevent unnecessary refetches
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
    toast({
      title: "Appointment Removed",
      description: "The appointment has been removed.",
    });
  };

  // Memoize computed values for better performance
  const recentDocuments = React.useMemo(() => allDocuments?.slice(0, 5), [allDocuments]);

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
    if (!doc.createdAt) return false;
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

  const upcomingAppointments = appointments.filter(apt => new Date(apt.date) > new Date());
  const nextAppointment = upcomingAppointments[0];
  const hasUpcomingAppointment = upcomingAppointments.length > 0;
  const appointmentDate = hasUpcomingAppointment ? new Date(nextAppointment.date) : null;
  const isAppointmentSoon = appointmentDate && appointmentDate.getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000;

  return (
    <div className="min-h-screen bg-clean-white">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-professional-dark mb-2">
            Welcome back, {(user as any)?.firstName || 'Patient'}!
          </h1>
          <p className="text-gray-600">
            Here's your personalized health intelligence dashboard with AI-powered insights from your medical data.
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
                  <Activity className="text-trust-purple h-6 w-6" />
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
                    {recentDocuments?.[0]?.createdAt 
                      ? format(new Date(recentDocuments[0].createdAt!), 'MMM d')
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
                        <span className="px-3 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full capitalize">
                          {document.documentType.replace('_', ' ')}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-4">No documents uploaded yet</p>
                    <Button asChild className="bg-medical-blue text-white hover:bg-blue-700">
                      <Link href="/documents">
                        <Upload className="mr-2 h-4 w-4" />
                        Upload First Document
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Next Appointment */}
          <div>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-semibold text-professional-dark">
                    Next Appointment
                  </CardTitle>
                  <Dialog open={appointmentDialogOpen} onOpenChange={setAppointmentDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Schedule Appointment</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="appointment-date">Date & Time</Label>
                          <Input
                            id="appointment-date"
                            type="datetime-local"
                            value={newAppointment.date}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, date: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="doctor-name">Doctor Name</Label>
                          <Input
                            id="doctor-name"
                            placeholder="Dr. Smith"
                            value={newAppointment.doctor}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, doctor: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="appointment-description">Description (Optional)</Label>
                          <Textarea
                            id="appointment-description"
                            placeholder="Annual checkup, follow-up visit, etc."
                            value={newAppointment.description}
                            onChange={(e) => setNewAppointment(prev => ({ ...prev, description: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button onClick={saveAppointment} className="bg-medical-blue text-white hover:bg-blue-700">
                            Save Appointment
                          </Button>
                          <Button variant="outline" onClick={() => setAppointmentDialogOpen(false)}>
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
                        <div key={appointment.id} className={`p-3 rounded-lg border-l-4 ${isAptSoon ? 'bg-orange-50 border-orange-400' : 'bg-blue-50 border-blue-400'}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <h6 className="font-medium text-professional-dark">{appointment.doctor}</h6>
                              <p className="text-sm text-gray-600">
                                {format(aptDate, 'MMM d, yyyy • h:mm a')}
                              </p>
                              {appointment.description && (
                                <p className="text-sm text-gray-700 mt-1">{appointment.description}</p>
                              )}
                              {isAptSoon && (
                                <p className="text-xs text-orange-600 mt-1 font-medium">Upcoming within 7 days</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className={`h-4 w-4 ${isAptSoon ? 'text-orange-500' : 'text-blue-500'}`} />
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => removeAppointment(appointment.id)}
                                className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {upcomingAppointments.length > 3 && (
                      <p className="text-xs text-gray-500 text-center pt-2">
                        +{upcomingAppointments.length - 3} more appointments
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Calendar className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <p className="text-sm text-gray-600 mb-3">No upcoming appointments</p>
                    <p className="text-xs text-gray-500">Schedule your next checkup to stay on track</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg font-semibold text-professional-dark">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button asChild className="w-full bg-medical-blue text-white hover:bg-blue-700 justify-start">
                    <Link href="/documents">
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Document
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full justify-start">
                    <Link href="/symptoms">
                      <Activity className="mr-2 h-4 w-4" />
                      Track Symptoms
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}