import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import WaitlistModal from "@/components/waitlist-modal";
import {
  Shield,
  Brain,
  Sparkles,
  ArrowRight,
  CheckCircle,
  Zap,
  TrendingUp,
  FileText,
  Activity,
  Calendar,
  Lock,
  Star,
  ChevronRight
} from "lucide-react";
import analytics from "@/lib/analytics/umami";

export default function Landing() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSource, setWaitlistSource] = useState('unknown');

  // Track page visit
  useEffect(() => {
    analytics.pageVisited('/');
  }, []);

  const handleGetStarted = (location: string) => {
    analytics.ctaClicked('get_started', location);
    setWaitlistSource(location);
    setWaitlistOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Navigation */}
      <nav className="nav-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center group">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary group-hover:scale-105 transition-all duration-200">
                  <Brain className="text-white h-5 w-5" />
                </div>
                <span className="text-xl font-semibold text-foreground">MediVault</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button
                onClick={() => handleGetStarted('nav')}
                className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 font-medium rounded-xl px-6"
              >
                Join Waitlist
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"></div>
        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center space-x-2 bg-surface-1 border border-white/10 rounded-full px-4 py-2 mb-8 text-sm text-foreground-muted">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>AI-Powered Health Intelligence</span>
            </div>
            
            <h1 className="text-5xl lg:text-7xl font-bold mb-8 leading-tight">
              <span className="text-foreground">Your Health Data,</span>
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Finally Intelligent
              </span>
            </h1>
            
            <p className="text-xl lg:text-2xl text-foreground-muted mb-12 leading-relaxed max-w-3xl mx-auto">
              Stop drowning in medical paperwork. Our AI analyzes your documents, tracks patterns, and delivers personalized insights that actually help you understand your health.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Button
                size="lg"
                onClick={() => handleGetStarted('hero')}
                className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 font-medium text-lg px-8 py-4 rounded-xl group"
              >
                Join the Waitlist
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <div className="flex items-center space-x-2 text-foreground-muted">
                <CheckCircle className="h-4 w-4 text-primary" />
                <span className="text-sm">Coming soon • Be first to know</span>
              </div>
            </div>

            {/* Demo Cards */}
            <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* Health Timeline Card */}
              <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted">Health Timeline</span>
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { event: "Annual Physical", date: "Dec 15", color: "bg-primary" },
                      { event: "Lab Results", date: "Nov 28", color: "bg-secondary" },
                      { event: "Specialist Visit", date: "Nov 12", color: "bg-accent" }
                    ].map((item, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className={`w-2 h-2 ${item.color} rounded-full`}></div>
                        <div className="flex-1 flex justify-between items-center">
                          <span className="text-sm text-foreground font-medium">{item.event}</span>
                          <span className="text-xs text-foreground-muted">{item.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* AI Insights Card */}
              <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted">AI Insights</span>
                    <Brain className="w-4 h-4 text-primary" />
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                      <p className="text-xs text-foreground-muted mb-1">Pattern Detected</p>
                      <p className="text-sm text-foreground">Blood pressure trending upward over 3 months</p>
                    </div>
                    <div className="p-3 bg-secondary/10 rounded-lg border border-secondary/20">
                      <p className="text-xs text-foreground-muted mb-1">Recommendation</p>
                      <p className="text-sm text-foreground">Consider cardiology follow-up</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Documents Card */}
              <Card className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted">Documents</span>
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="space-y-3">
                    {[
                      { name: "Blood Test Results", type: "Lab", color: "bg-primary" },
                      { name: "Cardiac Assessment", type: "Specialist", color: "bg-secondary" },
                      { name: "MRI Scan", type: "Imaging", color: "bg-accent" }
                    ].map((doc, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-2 h-2 ${doc.color} rounded-full`}></div>
                          <span className="text-sm text-foreground font-medium">{doc.name}</span>
                        </div>
                        <span className="text-xs text-foreground-muted">{doc.type}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-foreground">
              Health Intelligence That
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Actually Works</span>
            </h2>
            <p className="text-xl text-foreground-muted max-w-3xl mx-auto leading-relaxed">
              Our AI doesn't just store your data — it understands it, connects patterns, and delivers insights that transform how you manage your health.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {[
              {
                icon: Brain,
                title: "Smart Document Analysis",
                description: "Upload any medical document and watch our AI instantly extract key insights, track trends, and flag important changes in real-time.",
                gradient: "from-primary to-primary/70"
              },
              {
                icon: TrendingUp,
                title: "Pattern Recognition",
                description: "AI connects your symptoms, treatments, and results to reveal patterns you'd never notice, helping you understand your health journey.",
                gradient: "from-secondary to-secondary/70"
              },
              {
                icon: Zap,
                title: "Predictive Insights",
                description: "Get AI-powered recommendations for optimal care timing, treatment adjustments, and preventive measures based on your unique profile.",
                gradient: "from-accent to-accent/70"
              },
              {
                icon: Activity,
                title: "Symptom Intelligence",
                description: "Track symptoms and let AI correlate them with your medical history, treatments, and lifestyle for personalized health insights.",
                gradient: "from-primary to-secondary"
              },
              {
                icon: FileText,
                title: "Unified Health Records",
                description: "All your medical documents, test results, and health data organized intelligently in one secure, searchable platform.",
                gradient: "from-secondary to-accent"
              },
              {
                icon: Calendar,
                title: "Proactive Care Planning",
                description: "AI analyzes your health patterns to suggest optimal timing for checkups, reminders, and follow-up care.",
                gradient: "from-accent to-primary"
              }
            ].map((feature, index) => (
              <Card key={index} className="bg-surface-1 border-white/10 hover:bg-surface-2 transition-all duration-300 group p-8">
                <CardContent className="p-0">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} w-fit mb-6 group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4 text-foreground">{feature.title}</h3>
                  <p className="text-foreground-muted leading-relaxed">
                    {feature.description}
                  </p>
                  <div className="flex items-center mt-4 text-primary group-hover:translate-x-1 transition-transform duration-300">
                    <span className="text-sm font-medium">Learn more</span>
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-24 bg-surface-1 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-6 text-foreground">
              Trusted by Health-Conscious Individuals
            </h2>
            <div className="flex items-center justify-center space-x-1 mb-8">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 text-amber-400 fill-current" />
              ))}
              <span className="ml-2 text-foreground-muted">4.9/5 from 2,000+ users</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                quote: "The AI insights completely changed how I understand my health. It connected patterns I never saw and helped me have much better conversations with my doctors.",
                author: "Sarah M.",
                title: "Chronic Care Patient"
              },
              {
                quote: "Finally, all my medical records make sense. The AI summaries before doctor visits have been a game-changer for getting better care.",
                author: "David R.",
                title: "Health Enthusiast"
              },
              {
                quote: "I caught a trend in my lab results that my doctor missed. The AI flagged it months before it became a problem. This platform saved my health.",
                author: "Maria L.",
                title: "Preventive Care Advocate"
              }
            ].map((testimonial, index) => (
              <Card key={index} className="bg-surface-2 border-white/10 p-8">
                <CardContent className="p-0">
                  <blockquote className="text-foreground mb-6 italic">
                    "{testimonial.quote}"
                  </blockquote>
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-primary to-secondary rounded-full flex items-center justify-center">
                      <span className="text-white text-sm font-semibold">
                        {testimonial.author.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    <div>
                      <p className="text-foreground font-semibold">{testimonial.author}</p>
                      <p className="text-foreground-muted text-sm">{testimonial.title}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10"></div>
        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <h2 className="text-4xl lg:text-6xl font-bold text-foreground mb-8">
            Ready to Transform Your
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Health Intelligence?</span>
          </h2>
          <p className="text-xl text-foreground-muted mb-12 leading-relaxed max-w-2xl mx-auto">
            Join thousands who've discovered what AI can reveal about their health. Get personalized insights and make smarter healthcare decisions.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <Button
              size="lg"
              onClick={() => handleGetStarted('cta_section')}
              className="bg-gradient-to-r from-primary to-secondary text-white hover:opacity-90 font-medium text-lg px-8 py-4 rounded-xl group"
            >
              Reserve Your Spot
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          <div className="flex items-center justify-center space-x-8 text-foreground-muted">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm">Free to start</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm">100% Private</span>
            </div>
            <div className="flex items-center space-x-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="text-sm">AI-Powered</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-surface-1 border-t border-white/10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary">
                <Brain className="text-white h-5 w-5" />
              </div>
              <span className="ml-3 text-xl font-semibold text-foreground">MediVault</span>
            </div>
            <p className="mb-8 leading-relaxed max-w-2xl mx-auto text-foreground-muted">
              Transforming healthcare through AI-powered insights. Making every health decision smarter and every doctor visit more productive.
            </p>
            
            <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-white/10">
              <p className="text-foreground-muted">© 2024 MediVault. All rights reserved.</p>
              <div className="flex items-center mt-4 md:mt-0 space-x-6 text-sm text-foreground-muted">
                <span>Privacy Policy</span>
                <span>Terms of Service</span>
                <span>Contact</span>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Waitlist Modal */}
      <WaitlistModal
        open={waitlistOpen}
        onOpenChange={setWaitlistOpen}
        source={waitlistSource}
      />
    </div>
  );
}