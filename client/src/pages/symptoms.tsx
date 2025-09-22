import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { isUnauthorizedError } from "@/lib/authUtils";
import { apiRequest } from "@/lib/queryClient";
import Navigation from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { 
  Plus, 
  Search, 
  Calendar,
  Clock,
  MapPin,
  Thermometer,
  Trash2,
  Edit,
  Activity
} from "lucide-react";
import { format } from "date-fns";
import type { Symptom } from "@shared/schema";

export default function Symptoms() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();
  const queryClient = useQueryClient();
  
  const [isAddingSymptom, setIsAddingSymptom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSymptom, setEditingSymptom] = useState<Symptom | null>(null);

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

  const { data: symptoms, isLoading: symptomsLoading } = useQuery<Symptom[]>({
    queryKey: ["/api/symptoms"],
    enabled: isAuthenticated,
  });

  const createSymptomMutation = useMutation({
    mutationFn: async (symptomData: any) => {
      await apiRequest("POST", "/api/symptoms", symptomData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/symptoms"] });
      toast({
        title: "Success",
        description: "Symptom logged successfully",
      });
      setIsAddingSymptom(false);
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
        description: "Failed to log symptom",
        variant: "destructive",
      });
    },
  });

  const deleteSymptomMutation = useMutation({
    mutationFn: async (symptomId: number) => {
      await apiRequest("DELETE", `/api/symptoms/${symptomId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/symptoms"] });
      toast({
        title: "Success",
        description: "Symptom deleted successfully",
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
        description: "Failed to delete symptom",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-clean-white">
        <Navigation />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
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

  const filteredSymptoms = symptoms?.filter(symptom => {
    if (!searchQuery) return true;
    return (
      symptom.symptomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      symptom.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      symptom.location?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  const getSeverityColor = (severity: number) => {
    if (severity <= 3) return "bg-health-green bg-opacity-10 text-health-green";
    if (severity <= 6) return "bg-warm-amber bg-opacity-10 text-warm-amber";
    return "bg-red-500 bg-opacity-10 text-red-500";
  };

  const handleDelete = (symptomId: number) => {
    if (confirm("Are you sure you want to delete this symptom entry? This action cannot be undone.")) {
      deleteSymptomMutation.mutate(symptomId);
    }
  };

  return (
    <div className="min-h-screen bg-clean-white">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-professional-dark mb-2">Symptom Tracker</h1>
            <p className="text-gray-600">
              Log symptoms and let AI analyze patterns, connections to treatments, and provide personalized health insights
            </p>
          </div>
          <Button 
            onClick={() => setIsAddingSymptom(true)}
            className="bg-medical-blue text-white hover:bg-blue-700 mt-4 sm:mt-0"
          >
            <Plus className="mr-2 h-4 w-4" />
            Log Symptom
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search symptoms, locations, or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Add Symptom Form */}
        {isAddingSymptom && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-professional-dark">
                Log New Symptom
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SymptomForm
                onSubmit={(data) => createSymptomMutation.mutate(data)}
                onCancel={() => setIsAddingSymptom(false)}
                isLoading={createSymptomMutation.isPending}
              />
            </CardContent>
          </Card>
        )}

        {/* Symptoms List */}
        {symptomsLoading ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-8 w-20 rounded-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredSymptoms.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSymptoms.map((symptom) => (
              <Card key={symptom.id} className="hover:shadow-lg transition-all duration-200">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-professional-dark text-lg capitalize">
                        {symptom.symptomName}
                      </h3>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge className={`text-xs ${getSeverityColor(symptom.severity)}`}>
                          <Thermometer className="mr-1 h-3 w-3" />
                          Severity {symptom.severity}/10
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingSymptom(symptom)}
                        className="h-8 w-8"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(symptom.id)}
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {symptom.description && (
                    <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                      {symptom.description}
                    </p>
                  )}

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>
                        {format(new Date(symptom.dateRecorded), "MMM d, yyyy")}
                      </span>
                    </div>
                    
                    {symptom.timeOfDay && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Clock className="mr-2 h-4 w-4" />
                        <span className="capitalize">{symptom.timeOfDay}</span>
                      </div>
                    )}
                    
                    {symptom.location && (
                      <div className="flex items-center text-sm text-gray-500">
                        <MapPin className="mr-2 h-4 w-4" />
                        <span>{symptom.location}</span>
                      </div>
                    )}

                    {symptom.duration && (
                      <div className="flex items-center text-sm text-gray-500">
                        <Activity className="mr-2 h-4 w-4" />
                        <span>Duration: {symptom.duration}</span>
                      </div>
                    )}
                  </div>

                  {/* Triggers and Medications */}
                  {((symptom.triggers && symptom.triggers.length > 0) || 
                    (symptom.medications && symptom.medications.length > 0)) && (
                    <div className="space-y-2">
                      {symptom.triggers && symptom.triggers.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Triggers:</p>
                          <div className="flex flex-wrap gap-1">
                            {symptom.triggers.slice(0, 3).map((trigger, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {trigger}
                              </Badge>
                            ))}
                            {symptom.triggers.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{symptom.triggers.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}

                      {symptom.medications && symptom.medications.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Medications:</p>
                          <div className="flex flex-wrap gap-1">
                            {symptom.medications.slice(0, 3).map((medication, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {medication}
                              </Badge>
                            ))}
                            {symptom.medications.length > 3 && (
                              <Badge variant="outline" className="text-xs">
                                +{symptom.medications.length - 3} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : symptoms && symptoms.length > 0 ? (
          <div className="text-center py-12">
            <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No symptoms found</h3>
            <p className="text-gray-500 mb-4">
              Try adjusting your search criteria
            </p>
            <Button 
              variant="outline"
              onClick={() => setSearchQuery("")}
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="text-center py-12">
            <Activity className="w-16 h-16 text-gray-400 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold text-gray-600 mb-4">No symptoms logged yet</h3>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Start tracking your symptoms to identify patterns and share valuable information with your healthcare providers.
            </p>
            <Button 
              onClick={() => setIsAddingSymptom(true)}
              className="bg-medical-blue text-white hover:bg-blue-700"
            >
              <Plus className="mr-2 h-4 w-4" />
              Log Your First Symptom
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

interface SymptomFormProps {
  onSubmit: (data: any) => void;
  onCancel: () => void;
  isLoading: boolean;
  initialData?: Partial<Symptom>;
}

function SymptomForm({ onSubmit, onCancel, isLoading, initialData }: SymptomFormProps) {
  const [formData, setFormData] = useState({
    symptomName: initialData?.symptomName || "",
    severity: initialData?.severity || 5,
    description: initialData?.description || "",
    location: initialData?.location || "",
    duration: initialData?.duration || "",
    triggers: initialData?.triggers?.join(", ") || "",
    medications: initialData?.medications?.join(", ") || "",
    notes: initialData?.notes || "",
    dateRecorded: initialData?.dateRecorded || new Date().toISOString().split('T')[0],
    timeOfDay: initialData?.timeOfDay || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const submitData = {
      ...formData,
      triggers: formData.triggers ? formData.triggers.split(",").map(t => t.trim()).filter(Boolean) : [],
      medications: formData.medications ? formData.medications.split(",").map(m => m.trim()).filter(Boolean) : [],
    };

    onSubmit(submitData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Symptom Name *
          </label>
          <Input
            value={formData.symptomName}
            onChange={(e) => setFormData({ ...formData, symptomName: e.target.value })}
            placeholder="e.g., Headache, Nausea, Fatigue"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Date Recorded *
          </label>
          <Input
            type="date"
            value={formData.dateRecorded}
            onChange={(e) => setFormData({ ...formData, dateRecorded: e.target.value })}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-professional-dark mb-2">
          Severity Level: {formData.severity}/10
        </label>
        <Slider
          value={[formData.severity]}
          onValueChange={(value) => setFormData({ ...formData, severity: value[0] })}
          max={10}
          min={1}
          step={1}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>Mild (1)</span>
          <span>Moderate (5)</span>
          <span>Severe (10)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Location
          </label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g., Forehead, Left knee"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Duration
          </label>
          <Select value={formData.duration} onValueChange={(value) => setFormData({ ...formData, duration: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Time of Day
          </label>
          <Select value={formData.timeOfDay} onValueChange={(value) => setFormData({ ...formData, timeOfDay: value })}>
            <SelectTrigger>
              <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="afternoon">Afternoon</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
              <SelectItem value="night">Night</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-professional-dark mb-2">
          Description
        </label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the symptom in more detail..."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Triggers (comma-separated)
          </label>
          <Input
            value={formData.triggers}
            onChange={(e) => setFormData({ ...formData, triggers: e.target.value })}
            placeholder="e.g., Stress, Weather, Food"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-professional-dark mb-2">
            Medications Taken (comma-separated)
          </label>
          <Input
            value={formData.medications}
            onChange={(e) => setFormData({ ...formData, medications: e.target.value })}
            placeholder="e.g., Ibuprofen, Acetaminophen"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-professional-dark mb-2">
          Additional Notes
        </label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any other relevant information..."
          rows={2}
        />
      </div>

      <div className="flex justify-end space-x-4 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isLoading || !formData.symptomName || !formData.dateRecorded}
          className="bg-medical-blue text-white hover:bg-blue-700"
        >
          {isLoading ? "Saving..." : "Save Symptom"}
        </Button>
      </div>
    </form>
  );
}