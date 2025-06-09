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
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-medical-blue to-trust-purple py-20 lg:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-8 items-start">
            <div className="text-white lg:col-span-1">
              <h1 className="text-4xl lg:text-5xl font-bold mb-6 leading-tight">
                Take Control of Your Health —
                <span className="text-warm-amber"> Without the Chaos</span>
              </h1>
              <p className="text-xl mb-8 text-blue-100 leading-relaxed">
                Your health records are scattered. Your symptoms, untracked. Your appointments? Forgotten.
                MediVault brings it all together — securely, simply, and finally in your control.
              </p>
              <div className="flex justify-center">
                <Button 
                  size="lg"
                  onClick={handleGetStarted}
                  className="bg-health-green text-white hover:bg-emerald-600 font-semibold text-lg transform hover:scale-105 transition-all duration-200"
                >
                  Create Your Account
                </Button>
              </div>
              <div className="flex items-center mt-8 text-blue-100">
                <Lock className="mr-2 h-4 w-4" />
                <span className="text-sm">Secure & Private • Your Data Stays Yours</span>
              </div>
            </div>
            
            {/* Timeline Card */}
            <div className="relative">
              <Card className="rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Recent Health Timeline</span>
                      <div className="w-3 h-3 bg-health-green rounded-full"></div>
                    </div>
                    
                    <div className="space-y-4">
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
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Stored Documents</span>
                      <div className="w-3 h-3 bg-medical-blue rounded-full"></div>
                    </div>
                    
                    <div className="space-y-4">
                      {[
                        { name: "Blood Analysis", type: "Lab Report", date: "Nov 28", icon: "📊" },
                        { name: "ECG Results", type: "Test Results", date: "Nov 12", icon: "❤️" },
                        { name: "X-Ray Chest", type: "Imaging", date: "Oct 15", icon: "🔍" },
                        { name: "Prescription", type: "Medication", date: "Oct 30", icon: "💊" }
                      ].map((doc, index) => (
                        <div key={index} className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="text-lg">{doc.icon}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium block" style={{ color: "hsl(215, 28%, 17%)" }}>{doc.name}</span>
                                <span className="text-xs" style={{ color: "hsl(215, 15%, 45%)" }}>{doc.type}</span>
                              </div>
                              <span className="text-xs" style={{ color: "hsl(215, 15%, 45%)" }}>{doc.date}</span>
                            </div>
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
              All Your Health Info, One Place
            </h2>
            <p className="text-xl max-w-3xl mx-auto" style={{ color: "hsl(215, 15%, 45%)" }}>
              Your health history shouldn't live in random email threads, old paperwork, or forgotten apps. MediVault puts everything in one place — accessible, organized, and ready when you need it.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Upload,
                title: "Upload & Organize",
                description: "Easily store lab results, prescriptions, medical images, and documents. Files are automatically organized by date and type — no setup required.",
                color: "medical-blue"
              },
              {
                icon: Activity,
                title: "Symptom Tracking",
                description: "Log symptoms as they happen. Track changes over time, spot trends, and share accurate information with your doctors.",
                color: "health-green"
              },
              {
                icon: Calendar,
                title: "Appointment Timeline",
                description: "Keep track of all your past and upcoming medical visits with a clear, visual timeline. No more missed follow-ups or confusion.",
                color: "trust-purple"
              },
              {
                icon: Search,
                title: "Smart Search",
                description: "Quickly find any record using powerful filters. Search by doctor, keyword, condition, or date.",
                color: "warm-amber"
              },
              {
                icon: Share2,
                title: "Private Sharing",
                description: "Securely share specific records with healthcare providers. You choose what to share and who sees it.",
                color: "medical-blue"
              },
              {
                icon: Bell,
                title: "Reminders That Actually Help",
                description: "Set custom reminders for medications, checkups, or health goals. Stay on track without the mental load.",
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
      <footer className="bg-professional-dark text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <Shield className="text-medical-blue text-2xl mr-3" />
              <span className="text-xl font-semibold">MediVault</span>
            </div>
            <p className="text-white/80 mb-6 leading-relaxed max-w-2xl mx-auto">
              Empowering patients to take control of their healthcare journey through secure, organized medical record management.
            </p>
          </div>
          
          <div className="border-t border-white/20 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-white/60">© 2024 MediVault. All rights reserved.</p>
            <div className="flex items-center mt-4 md:mt-0">
              <Shield className="text-health-green mr-2 h-4 w-4" />
              <span className="text-white/60 text-sm">Secure & Private • Your Data Stays Yours</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
