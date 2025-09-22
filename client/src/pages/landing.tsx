import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Shield, 
  Upload, 
  Calendar, 
  Search, 
  Share2, 
  Smartphone, 
  Bell,
  Lock,
  UserCheck,
  Server,
  Star,
  CheckCircle,
  Activity
} from "lucide-react";

export default function Landing() {
  const handleGetStarted = () => {
    window.location.href = "/api/login";
  };

  const handleSignIn = () => {
    window.location.href = "/api/login";
  };

  return (
    <div className="min-h-screen bg-clean-white">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <div className="flex-shrink-0 flex items-center">
                <Shield className="text-medical-blue text-2xl mr-3" />
                <span className="text-xl font-semibold" style={{ color: "hsl(215, 28%, 17%)" }}>MediVault</span>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="ml-10 flex items-baseline space-x-8">
                <Button 
                  variant="ghost" 
                  onClick={handleSignIn}
                  className="text-medical-blue hover:text-blue-700 font-medium"
                >
                  Sign In
                </Button>
                <Button 
                  onClick={handleGetStarted}
                  className="bg-medical-blue text-white hover:bg-blue-700 font-medium"
                >
                  Get Started
                </Button>
              </div>
            </div>
            
            {/* Mobile menu button */}
            <div className="md:hidden">
              <div className="flex space-x-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleSignIn}
                  className="text-medical-blue hover:text-blue-700 font-medium"
                >
                  Sign In
                </Button>
                <Button 
                  size="sm"
                  onClick={handleGetStarted}
                  className="bg-medical-blue text-white hover:bg-blue-700 font-medium"
                >
                  Login
                </Button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-medical-blue to-trust-purple py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-4 gap-6 items-start">
            <div className="text-white lg:col-span-1">
              <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight">
                AI-Powered Health Insights —
                <span className="text-warm-amber"> Tailored Just for You</span>
              </h1>
              <p className="text-xl mb-8 text-blue-100 leading-relaxed">
                Stop guessing about your health. Our AI analyzes your documents, symptoms, tests, and history to give you personalized health insights and actionable recommendations — like having a health expert who knows everything about you.
              </p>
              <div className="flex justify-center">
                <Button 
                  size="lg"
                  onClick={handleGetStarted}
                  className="bg-health-green text-white hover:bg-emerald-600 font-semibold text-lg transform hover:scale-105 transition-all duration-200"
                >
                  Get AI Health Insights
                </Button>
              </div>
              <div className="flex items-center mt-8 text-blue-100">
                <Lock className="mr-2 h-4 w-4" />
                <span className="text-sm">AI-Powered Analysis • 100% Private • Your Data Stays Yours</span>
              </div>
            </div>
            
            {/* Timeline Card */}
            <div className="relative">
              <Card className="rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Recent Health Timeline</span>
                      <div className="w-3 h-3 bg-health-green rounded-full"></div>
                    </div>
                    
                    <div className="space-y-2">
                      {[
                        { date: "Dec 15", event: "Annual Physical", type: "checkup", color: "bg-medical-blue" },
                        { date: "Nov 28", event: "Lab Results", type: "lab", color: "bg-health-green" },
                        { date: "Nov 12", event: "Cardiology Consult", type: "specialist", color: "bg-trust-purple" },
                        { date: "Oct 30", event: "Prescription Refill", type: "medication", color: "bg-warm-amber" }
                      ].map((item, index) => (
                        <div key={index} className="flex items-center space-x-3">
                          <div className={`w-3 h-3 ${item.color} rounded-full flex-shrink-0`}></div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium" style={{ color: "hsl(215, 28%, 17%)" }}>{item.event}</span>
                              <span className="text-xs" style={{ color: "hsl(215, 15%, 45%)" }}>{item.date}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Documents Card */}
            <div className="relative">
              <Card className="rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Stored Documents</span>
                      <div className="w-3 h-3 bg-medical-blue rounded-full"></div>
                    </div>
                    
                    <div className="space-y-2">
                      {[
                        { name: "Blood Analysis", type: "Lab Report", date: "Nov 28", color: "bg-health-green" },
                        { name: "ECG Results", type: "Test Results", date: "Nov 12", color: "bg-medical-blue" },
                        { name: "X-Ray Chest", type: "Imaging", date: "Oct 15", color: "bg-trust-purple" }
                      ].map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 ${doc.color} rounded-full flex-shrink-0`}></div>
                            <span className="text-sm font-medium" style={{ color: "hsl(215, 28%, 17%)" }}>{doc.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs block" style={{ color: "hsl(215, 15%, 45%)" }}>{doc.type}</span>
                            <span className="text-xs" style={{ color: "hsl(215, 15%, 45%)" }}>{doc.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
            
            {/* Symptoms Tracking Card */}
            <div className="relative">
              <Card className="rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Symptom Tracking</span>
                      <div className="w-3 h-3 bg-trust-purple rounded-full"></div>
                    </div>
                    
                    <div className="space-y-2">
                      {[
                        { symptom: "Headache", severity: "Mild", date: "Today", color: "bg-health-green" },
                        { symptom: "Joint Pain", severity: "Moderate", date: "Yesterday", color: "bg-warm-amber" },
                        { symptom: "Fatigue", severity: "Mild", date: "Dec 1", color: "bg-trust-purple" }
                      ].map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="flex items-center space-x-3">
                            <div className={`w-3 h-3 ${item.color} rounded-full flex-shrink-0`}></div>
                            <span className="text-sm font-medium" style={{ color: "hsl(215, 28%, 17%)" }}>{item.symptom}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs block" style={{ color: "hsl(215, 15%, 45%)" }}>{item.severity}</span>
                            <span className="text-xs" style={{ color: "hsl(215, 15%, 45%)" }}>{item.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4" style={{ color: "hsl(215, 28%, 17%)" }}>
              AI That Actually Understands Your Health
            </h2>
            <p className="text-xl max-w-3xl mx-auto" style={{ color: "hsl(215, 15%, 45%)" }}>
              Our intelligent AI doesn't just store your data — it analyzes patterns, connects the dots between symptoms and treatments, and gives you insights that help you make better health decisions. It's like having a medical expert who never forgets anything about you.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Upload,
                title: "Smart Document Analysis",
                description: "Upload any medical document and watch our AI instantly extract key insights, track trends, and flag important changes. Your lab results become actionable intelligence.",
                color: "medical-blue"
              },
              {
                icon: Activity,
                title: "AI-Powered Symptom Intelligence",
                description: "Our AI connects your symptoms to your medical history, treatments, and lifestyle patterns. Get personalized insights about what might be causing changes and when to seek care.",
                color: "health-green"
              },
              {
                icon: Calendar,
                title: "Predictive Health Planning",
                description: "AI analyzes your health patterns to suggest optimal timing for checkups, remind you of follow-ups based on your conditions, and help you stay ahead of your health needs.",
                color: "trust-purple"
              },
              {
                icon: Search,
                title: "Intelligent Health Search",
                description: "Ask natural questions like 'How has my blood pressure changed?' or 'What treatments worked best for my migraines?' Our AI understands context and delivers precise answers.",
                color: "warm-amber"
              },
              {
                icon: Share2,
                title: "AI-Generated Health Summaries",
                description: "Automatically create comprehensive health summaries for doctor visits. Our AI highlights relevant patterns, recent changes, and important trends to share with your care team.",
                color: "medical-blue"
              },
              {
                icon: Bell,
                title: "Personalized Health Recommendations",
                description: "Get AI-driven suggestions based on your unique health profile. From medication timing optimization to lifestyle recommendations tailored to your conditions and goals.",
                color: "health-green"
              }
            ].map((feature, index) => (
              <Card key={index} className="p-8 border border-gray-100 hover:shadow-lg hover:border-medical-blue transition-all duration-200 group">
                <CardContent className="p-0">
                  <div className="mb-6">
                    <feature.icon className={`w-12 h-12 text-${feature.color} group-hover:scale-110 transition-transform duration-200`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-4" style={{ color: "hsl(215, 28%, 17%)" }}>{feature.title}</h3>
                  <p className="leading-relaxed" style={{ color: "hsl(215, 15%, 45%)" }}>
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Built for People Section */}
      <section className="py-20 bg-gradient-to-r from-clean-white to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Card className="rounded-2xl shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center">
                    <UserCheck className="w-16 h-16 text-trust-purple mx-auto mb-6" />
                    <blockquote className="text-lg mb-4" style={{ color: "hsl(215, 28%, 17%)" }}>
                      "Now I know what's going on with my health and what questions to ask next. Everything is organized and ready."
                    </blockquote>
                    <p className="text-sm" style={{ color: "hsl(215, 15%, 45%)" }}>— Real user</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold mb-6" style={{ color: "hsl(215, 28%, 17%)" }}>
                Built for People,
                <span className="text-trust-purple"> Not Paperwork</span>
              </h2>
              <p className="text-xl mb-8 leading-relaxed" style={{ color: "hsl(215, 15%, 45%)" }}>
                Whether you're managing a chronic condition, keeping track of family care, or just want to stay organized — MediVault is designed to make your life easier, not more complicated.
              </p>
              
              <div className="space-y-6">
                {[
                  {
                    icon: Smartphone,
                    title: "Access Anytime, Anywhere",
                    description: "MediVault works seamlessly across all your devices — desktop, tablet, or mobile.",
                    color: "trust-purple"
                  },
                  {
                    icon: Lock,
                    title: "Privacy Comes First",
                    description: "Your medical history is personal. We use strong encryption and never sell your data.",
                    color: "medical-blue"
                  }
                ].map((item, index) => (
                  <div key={index} className="flex items-start">
                    <div className="mr-4 mt-1">
                      <item.icon className={`text-${item.color} h-6 w-6`} />
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2" style={{ color: "hsl(215, 28%, 17%)" }}>{item.title}</h4>
                      <p style={{ color: "hsl(215, 15%, 45%)" }}>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-medical-blue to-trust-purple">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-5xl font-bold text-white mb-6">
            Ready to Get Organized?
          </h2>
          <p className="text-xl text-blue-100 mb-10 leading-relaxed">
            Join others who've stopped relying on memory, sticky notes, and scattered documents.
            Start using MediVault and make your health history work for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg"
              onClick={handleGetStarted}
              className="bg-health-green text-white hover:bg-emerald-600 font-semibold text-lg transform hover:scale-105 transition-all duration-200"
            >
              Start Free Account
            </Button>

          </div>
          <div className="flex items-center justify-center mt-8 text-blue-100">
            <CheckCircle className="mr-2 h-4 w-4" />
            <span>No credit card required • Private & Secure</span>
          </div>
        </div>
      </section>

      {/* Transparency Section */}
      <section className="py-12 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm leading-relaxed" style={{ color: "hsl(215, 15%, 45%)" }}>
            MediVault is not a healthcare provider or certified storage facility. We're not HIPAA-compliant — and we're transparent about it. But we are committed to keeping your data safe, private, and only accessible by you.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16" style={{ backgroundColor: "hsl(215, 28%, 17%)" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Shield className="text-medical-blue text-2xl mr-3" />
              <span className="text-xl font-semibold text-white">MediVault</span>
            </div>
            <p className="mb-6 leading-relaxed max-w-2xl mx-auto text-white">
              Empowering patients to take control of their healthcare journey through secure, organized medical record management.
            </p>
          </div>
          
          <div className="border-t border-gray-500 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-white">© 2024 MediVault. All rights reserved.</p>
            <div className="flex items-center mt-4 md:mt-0">
              <Shield className="text-health-green mr-2 h-4 w-4" />
              <span className="text-sm text-white">Secure & Private • Your Data Stays Yours</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
