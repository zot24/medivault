import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useSymptoms, useCreateSymptom, useDeleteSymptom } from "@/lib/sdk";
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
  Activity,
  Brain,
  Sparkles,
  BarChart3,
  HeartHandshake,
  Zap,
  TrendingUp
} from "lucide-react";
import { format } from "date-fns";
import type { Symptom } from "@shared/schema";
import { localDate } from "@shared/upload-kinds";

export default function Symptoms() {
  const { toast } = useToast();
  const { isAuthenticated, isLoading } = useAuth();

  const [isAddingSymptom, setIsAddingSymptom] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingSymptom, setEditingSymptom] = useState<Symptom | null>(null);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to track symptoms.",
        variant: "destructive",
      });
      setTimeout(() => {
        window.location.href = "/login";
      }, 500);
      return;
    }
  }, [isAuthenticated, isLoading, toast]);

  const { data: symptoms, isLoading: symptomsLoading } = useSymptoms(undefined, {
    enabled: isAuthenticated,
  });

  const createSymptomMutation = useCreateSymptom({
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Symptom logged successfully",
      });
      setIsAddingSymptom(false);
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
        description: "Failed to log symptom",
        variant: "destructive",
      });
    },
  });

  const deleteSymptomMutation = useDeleteSymptom({
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Symptom deleted successfully",
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
        description: "Failed to delete symptom",
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

  const filteredSymptoms = symptoms?.filter(symptom => {
    if (!searchQuery) return true;
    return (
      symptom.symptomName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      symptom.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      symptom.location?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }) || [];

  const getSeverityColor = (severity: number) => {
    if (severity <= 3) return "from-green-500 to-green-600";
    if (severity <= 6) return "from-yellow-500 to-orange-500";
    return "from-red-500 to-red-600";
  };

  const getSeverityTextColor = (severity: number) => {
    if (severity <= 3) return "text-green-400";
    if (severity <= 6) return "text-yellow-400";
    return "text-red-400";
  };

  const handleDelete = (symptomId: number) => {
    if (confirm("Are you sure you want to delete this symptom entry? This action cannot be undone.")) {
      deleteSymptomMutation.mutate(symptomId);
    }
  };

  const avgSeverity = symptoms && symptoms.length > 0
    ? (symptoms.reduce((sum, s) => sum + s.severity, 0) / symptoms.length).toFixed(1)
    : "0";

  // Pattern Detection
  const patterns = symptoms && symptoms.length >= 3 ? (() => {
    // Count symptom occurrences
    const symptomCounts: Record<string, { count: number; avgSeverity: number; severities: number[]; timeOfDay: Record<string, number>; triggers: Record<string, number> }> = {};

    symptoms.forEach(s => {
      const name = s.symptomName.toLowerCase();
      if (!symptomCounts[name]) {
        symptomCounts[name] = { count: 0, avgSeverity: 0, severities: [], timeOfDay: {}, triggers: {} };
      }
      symptomCounts[name].count++;
      symptomCounts[name].severities.push(s.severity);

      if (s.timeOfDay) {
        symptomCounts[name].timeOfDay[s.timeOfDay] = (symptomCounts[name].timeOfDay[s.timeOfDay] || 0) + 1;
      }

      s.triggers?.forEach(trigger => {
        symptomCounts[name].triggers[trigger] = (symptomCounts[name].triggers[trigger] || 0) + 1;
      });
    });

    // Calculate averages
    Object.keys(symptomCounts).forEach(name => {
      const data = symptomCounts[name];
      data.avgSeverity = data.severities.reduce((a, b) => a + b, 0) / data.severities.length;
    });

    // Find recurring symptoms (3+ occurrences)
    const recurring = Object.entries(symptomCounts)
      .filter(([_, data]) => data.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3);

    // Find most common time of day
    const allTimeOfDay: Record<string, number> = {};
    symptoms.forEach(s => {
      if (s.timeOfDay) {
        allTimeOfDay[s.timeOfDay] = (allTimeOfDay[s.timeOfDay] || 0) + 1;
      }
    });
    const mostCommonTime = Object.entries(allTimeOfDay).length > 0
      ? Object.entries(allTimeOfDay).sort((a, b) => b[1] - a[1])[0]
      : null;

    // Find common triggers
    const allTriggers: Record<string, number> = {};
    symptoms.forEach(s => {
      s.triggers?.forEach(trigger => {
        allTriggers[trigger] = (allTriggers[trigger] || 0) + 1;
      });
    });
    const topTriggers = Object.entries(allTriggers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    return {
      recurring,
      mostCommonTime,
      topTriggers,
      symptomCounts,
    };
  })() : null;

  return (
    <div className="min-h-screen bg-background" data-testid="symptoms-page">
      <Navigation />
      
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-12">
          <div className="max-w-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="p-2 rounded-xl bg-gradient-to-br from-secondary to-accent">
                <Activity className="text-white h-5 w-5" />
              </div>
              <div className="inline-flex items-center space-x-2 bg-surface-1 border border-white/10 rounded-full px-3 py-1 text-xs text-foreground-muted">
                <Brain className="h-3 w-3 text-secondary" />
                <span>AI Pattern Analysis</span>
              </div>
            </div>
            <h1 className="text-4xl font-bold text-foreground mb-3">Symptom Intelligence</h1>
            <p className="text-xl text-foreground-muted">
              Track symptoms and let our AI discover patterns, correlate with treatments, and provide personalized health insights to optimize your care.
            </p>
          </div>
          <Button 
            onClick={() => setIsAddingSymptom(true)}
            className="bg-gradient-to-r from-secondary to-accent text-white hover:opacity-90 mt-6 lg:mt-0 px-6 py-3 rounded-xl"
            data-testid="button-add-symptom"
          >
            <Plus className="mr-2 h-5 w-5" />
            Log Symptom
          </Button>
        </div>

        {/* Search */}
        <div className="relative mb-8">
          <Search className="absolute left-3 top-3 h-4 w-4 text-foreground-muted" />
          <Input
            placeholder="Search symptoms, locations, or descriptions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-surface-1 border-white/20 text-foreground placeholder:text-foreground-muted"
            data-testid="input-search-symptoms"
          />
        </div>

        {/* Stats Row */}
        {symptoms && symptoms.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-secondary to-secondary/70">
                    <Activity className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">Total Logs</p>
                    <p className="text-lg font-bold text-foreground">{symptoms.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-accent to-accent/70">
                    <BarChart3 className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">Avg Severity</p>
                    <p className="text-lg font-bold text-foreground">{avgSeverity}/10</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-primary to-primary/70">
                    <TrendingUp className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">This Month</p>
                    <p className="text-lg font-bold text-foreground">
                      {symptoms.filter(symptom => {
                        const sympDate = localDate(symptom.dateRecorded);
                        const now = new Date();
                        return sympDate.getMonth() === now.getMonth() && sympDate.getFullYear() === now.getFullYear();
                      }).length}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-surface-1 border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-secondary to-accent">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-foreground-muted">Patterns</p>
                    <p className="text-lg font-bold text-foreground">
                      {new Set(symptoms.map(s => s.symptomName.toLowerCase())).size}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Pattern Insights */}
        {patterns && (patterns.recurring.length > 0 || patterns.mostCommonTime || patterns.topTriggers.length > 0) && (
          <Card className="mb-8 bg-gradient-to-br from-secondary/5 to-accent/5 border-secondary/20" data-testid="pattern-insights-card">
            <CardHeader>
              <div className="flex items-center space-x-2">
                <Brain className="h-5 w-5 text-secondary" />
                <CardTitle className="text-lg font-semibold text-foreground">
                  Pattern Insights
                </CardTitle>
              </div>
              <p className="text-sm text-foreground-muted">AI-detected patterns in your symptom data</p>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-4">
                {/* Recurring Symptoms */}
                {patterns.recurring.length > 0 && (
                  <div className="p-4 bg-surface-1 rounded-xl border border-white/10">
                    <div className="flex items-center space-x-2 mb-3">
                      <TrendingUp className="h-4 w-4 text-secondary" />
                      <h4 className="font-medium text-foreground text-sm">Recurring Symptoms</h4>
                    </div>
                    <div className="space-y-2">
                      {patterns.recurring.map(([name, data]) => (
                        <div key={name} className="flex items-center justify-between">
                          <span className="text-sm text-foreground capitalize">{name}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-foreground-muted">{data.count}x</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              data.avgSeverity >= 7 ? 'bg-red-500/20 text-red-400' :
                              data.avgSeverity >= 4 ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-green-500/20 text-green-400'
                            }`}>
                              avg {data.avgSeverity.toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time Patterns */}
                {patterns.mostCommonTime && (
                  <div className="p-4 bg-surface-1 rounded-xl border border-white/10">
                    <div className="flex items-center space-x-2 mb-3">
                      <Clock className="h-4 w-4 text-secondary" />
                      <h4 className="font-medium text-foreground text-sm">Time Pattern</h4>
                    </div>
                    <p className="text-sm text-foreground mb-1">
                      Symptoms occur most often in the <span className="font-medium text-secondary capitalize">{patterns.mostCommonTime[0]}</span>
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {patterns.mostCommonTime[1]} of {symptoms?.length || 0} logs ({Math.round((patterns.mostCommonTime[1] / (symptoms?.length || 1)) * 100)}%)
                    </p>
                  </div>
                )}

                {/* Common Triggers */}
                {patterns.topTriggers.length > 0 && (
                  <div className="p-4 bg-surface-1 rounded-xl border border-white/10">
                    <div className="flex items-center space-x-2 mb-3">
                      <Zap className="h-4 w-4 text-secondary" />
                      <h4 className="font-medium text-foreground text-sm">Top Triggers</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {patterns.topTriggers.map(([trigger, count]) => (
                        <span key={trigger} className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full border border-red-500/30">
                          {trigger} ({count})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Symptom Form */}
        {isAddingSymptom && (
          <Card className="mb-8 bg-surface-1 border-white/10" data-testid="add-symptom-form">
            <CardHeader>
              <CardTitle className="text-xl font-semibold text-foreground flex items-center space-x-2">
                <Sparkles className="h-5 w-5 text-secondary" />
                <span>Log New Symptom</span>
              </CardTitle>
              <p className="text-sm text-foreground-muted">AI will analyze patterns and correlations with your health data</p>
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
        ) : filteredSymptoms.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="symptoms-grid">
            {filteredSymptoms.map((symptom) => (
              <Card key={symptom.id} className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group" data-testid={`symptom-card-${symptom.id}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground text-lg capitalize mb-2">
                        {symptom.symptomName}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <div className={`px-3 py-1 rounded-full bg-gradient-to-r ${getSeverityColor(symptom.severity)} text-white text-xs font-medium flex items-center space-x-1`}>
                          <Thermometer className="h-3 w-3" />
                          <span>Severity {symptom.severity}/10</span>
                        </div>
                        {symptom.severity > 7 && (
                          <div className="flex items-center space-x-1">
                            <Zap className="h-3 w-3 text-red-400" />
                            <span className="text-xs text-red-400 font-medium">High</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditingSymptom(symptom)}
                        className="h-8 w-8 hover:bg-white/10"
                        data-testid={`button-edit-symptom-${symptom.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(symptom.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        data-testid={`button-delete-symptom-${symptom.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {symptom.description && (
                    <p className="text-foreground-muted text-sm mb-4 line-clamp-2">
                      {symptom.description}
                    </p>
                  )}

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center text-sm text-foreground-muted">
                      <Calendar className="mr-2 h-4 w-4" />
                      <span>
                        {format(localDate(symptom.dateRecorded), "MMM d, yyyy")}
                      </span>
                    </div>
                    
                    {symptom.timeOfDay && (
                      <div className="flex items-center text-sm text-foreground-muted">
                        <Clock className="mr-2 h-4 w-4" />
                        <span className="capitalize">{symptom.timeOfDay}</span>
                      </div>
                    )}
                    
                    {symptom.location && (
                      <div className="flex items-center text-sm text-foreground-muted">
                        <MapPin className="mr-2 h-4 w-4" />
                        <span>{symptom.location}</span>
                      </div>
                    )}

                    {symptom.duration && (
                      <div className="flex items-center text-sm text-foreground-muted">
                        <Activity className="mr-2 h-4 w-4" />
                        <span>Duration: {symptom.duration}</span>
                      </div>
                    )}
                  </div>

                  {/* Triggers and Medications */}
                  {((symptom.triggers && symptom.triggers.length > 0) || 
                    (symptom.medications && symptom.medications.length > 0)) && (
                    <div className="space-y-3 pt-3 border-t border-white/10">
                      {symptom.triggers && symptom.triggers.length > 0 && (
                        <div>
                          <p className="text-xs text-foreground-muted mb-2">Triggers:</p>
                          <div className="flex flex-wrap gap-1">
                            {symptom.triggers.slice(0, 3).map((trigger, index) => (
                              <span key={index} className="px-2 py-1 text-xs bg-red-500/20 text-red-400 rounded-full border border-red-500/30">
                                {trigger}
                              </span>
                            ))}
                            {symptom.triggers.length > 3 && (
                              <span className="px-2 py-1 text-xs bg-white/10 text-foreground-muted rounded-full border border-white/20">
                                +{symptom.triggers.length - 3} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {symptom.medications && symptom.medications.length > 0 && (
                        <div>
                          <p className="text-xs text-foreground-muted mb-2">Medications:</p>
                          <div className="flex flex-wrap gap-1">
                            {symptom.medications.slice(0, 3).map((medication, index) => (
                              <span key={index} className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full border border-green-500/30">
                                {medication}
                              </span>
                            ))}
                            {symptom.medications.length > 3 && (
                              <span className="px-2 py-1 text-xs bg-white/10 text-foreground-muted rounded-full border border-white/20">
                                +{symptom.medications.length - 3} more
                              </span>
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
          <div className="text-center py-16">
            <div className="p-4 rounded-2xl bg-gradient-to-br from-secondary/10 to-accent/10 w-fit mx-auto mb-6">
              <Search className="w-12 h-12 text-secondary mx-auto" />
            </div>
            <h3 className="text-xl font-semibold text-foreground mb-3">No symptoms found</h3>
            <p className="text-foreground-muted mb-6 max-w-sm mx-auto">
              Try adjusting your search criteria to find what you're looking for
            </p>
            <Button 
              variant="outline"
              onClick={() => setSearchQuery("")}
              className="border-white/20 text-foreground hover:bg-white/5"
              data-testid="button-clear-search"
            >
              Clear search
            </Button>
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="p-6 rounded-2xl bg-gradient-to-br from-secondary/10 to-accent/10 w-fit mx-auto mb-8">
              <HeartHandshake className="w-16 h-16 text-secondary mx-auto" />
            </div>
            <h3 className="text-3xl font-bold text-foreground mb-4">Start your health intelligence journey</h3>
            <p className="text-xl text-foreground-muted mb-8 max-w-2xl mx-auto leading-relaxed">
              Track symptoms to unlock powerful AI insights. Discover patterns, identify triggers, and correlate with treatments to optimize your health outcomes.
            </p>
            <Button 
              onClick={() => setIsAddingSymptom(true)}
              className="bg-gradient-to-r from-secondary to-accent text-white hover:opacity-90 px-8 py-4 rounded-xl text-lg"
              data-testid="button-log-first-symptom"
            >
              <Plus className="mr-2 h-5 w-5" />
              Log Your First Symptom
            </Button>
            <div className="flex items-center justify-center space-x-6 mt-8 text-foreground-muted">
              <div className="flex items-center space-x-2">
                <Brain className="h-4 w-4 text-secondary" />
                <span className="text-sm">AI Pattern Recognition</span>
              </div>
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-secondary" />
                <span className="text-sm">Smart Correlations</span>
              </div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="h-4 w-4 text-secondary" />
                <span className="text-sm">Health Optimization</span>
              </div>
            </div>
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

  const getSeverityColor = (severity: number) => {
    if (severity <= 3) return "text-green-400";
    if (severity <= 6) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Symptom Name *
          </label>
          <Input
            value={formData.symptomName}
            onChange={(e) => setFormData({ ...formData, symptomName: e.target.value })}
            placeholder="e.g., Headache, Nausea, Fatigue"
            required
            className="bg-surface-2 border-white/20 text-foreground"
            data-testid="input-symptom-name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Date Recorded *
          </label>
          <Input
            type="date"
            value={formData.dateRecorded}
            onChange={(e) => setFormData({ ...formData, dateRecorded: e.target.value })}
            required
            className="bg-surface-2 border-white/20 text-foreground"
            data-testid="input-date-recorded"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-3">
          <span className="flex items-center space-x-2">
            <span>Severity Level:</span>
            <span className={`font-bold ${getSeverityColor(formData.severity)}`}>{formData.severity}/10</span>
          </span>
        </label>
        <Slider
          value={[formData.severity]}
          onValueChange={(value) => setFormData({ ...formData, severity: value[0] })}
          max={10}
          min={1}
          step={1}
          className="w-full"
          data-testid="slider-severity"
        />
        <div className="flex justify-between text-xs text-foreground-muted mt-2">
          <span className="text-green-400">Mild (1)</span>
          <span className="text-yellow-400">Moderate (5)</span>
          <span className="text-red-400">Severe (10)</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Location
          </label>
          <Input
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            placeholder="e.g., Forehead, Left knee"
            className="bg-surface-2 border-white/20 text-foreground"
            data-testid="input-location"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Duration
          </label>
          <Select value={formData.duration} onValueChange={(value) => setFormData({ ...formData, duration: value })}>
            <SelectTrigger className="bg-surface-2 border-white/20 text-foreground" data-testid="select-duration">
              <SelectValue placeholder="Select duration" />
            </SelectTrigger>
            <SelectContent className="bg-surface-2 border-white/20">
              <SelectItem value="minutes">Minutes</SelectItem>
              <SelectItem value="hours">Hours</SelectItem>
              <SelectItem value="days">Days</SelectItem>
              <SelectItem value="ongoing">Ongoing</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Time of Day
          </label>
          <Select value={formData.timeOfDay} onValueChange={(value) => setFormData({ ...formData, timeOfDay: value })}>
            <SelectTrigger className="bg-surface-2 border-white/20 text-foreground" data-testid="select-time-of-day">
              <SelectValue placeholder="Select time" />
            </SelectTrigger>
            <SelectContent className="bg-surface-2 border-white/20">
              <SelectItem value="morning">Morning</SelectItem>
              <SelectItem value="afternoon">Afternoon</SelectItem>
              <SelectItem value="evening">Evening</SelectItem>
              <SelectItem value="night">Night</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Description
        </label>
        <Textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="Describe the symptom in more detail..."
          rows={3}
          className="bg-surface-2 border-white/20 text-foreground"
          data-testid="textarea-description"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Triggers (comma-separated)
          </label>
          <Input
            value={formData.triggers}
            onChange={(e) => setFormData({ ...formData, triggers: e.target.value })}
            placeholder="e.g., Stress, Weather, Food"
            className="bg-surface-2 border-white/20 text-foreground"
            data-testid="input-triggers"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Medications Taken (comma-separated)
          </label>
          <Input
            value={formData.medications}
            onChange={(e) => setFormData({ ...formData, medications: e.target.value })}
            placeholder="e.g., Ibuprofen, Acetaminophen"
            className="bg-surface-2 border-white/20 text-foreground"
            data-testid="input-medications"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Additional Notes
        </label>
        <Textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          placeholder="Any other relevant information..."
          rows={2}
          className="bg-surface-2 border-white/20 text-foreground"
          data-testid="textarea-notes"
        />
      </div>

      <div className="flex justify-end space-x-4 pt-6">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onCancel}
          className="border-white/20 text-foreground hover:bg-white/5"
          data-testid="button-cancel-symptom"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={isLoading || !formData.symptomName || !formData.dateRecorded}
          className="bg-gradient-to-r from-secondary to-accent text-white hover:opacity-90"
          data-testid="button-save-symptom"
        >
          {isLoading ? "Saving..." : "Save Symptom"}
        </Button>
      </div>
    </form>
  );
}