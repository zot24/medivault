import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import WaitlistModal from "@/components/waitlist-modal";
import {
  Shield,
  Lock,
  ArrowRight,
  CheckCircle,
  FileText,
  Activity,
  Heart,
  Leaf,
  Eye,
  Fingerprint
} from "lucide-react";
import analytics from "@/lib/analytics/umami";

export default function Landing() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistSource, setWaitlistSource] = useState('unknown');

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
      <nav className="nav-sanctuary sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center group cursor-pointer">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                    <Shield className="text-white h-5 w-5" />
                  </div>
                  <div className="absolute -inset-1 rounded-xl bg-gradient-to-br from-primary to-secondary opacity-20 blur-sm group-hover:opacity-30 transition-opacity"></div>
                </div>
                <span className="text-xl font-semibold text-foreground font-display">MediVault</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <a
                href="/login"
                className="text-foreground-muted hover:text-foreground transition-colors font-medium font-body"
              >
                Log in
              </a>
              <a
                href="/register"
                className="btn-sanctuary inline-flex items-center"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Organic background blobs */}
        <div className="absolute top-20 -left-32 w-96 h-96 blob-bg bg-primary/30"></div>
        <div className="absolute top-40 -right-32 w-80 h-80 blob-bg bg-secondary/20"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 blob-bg bg-primary/10"></div>

        {/* Subtle vault ring decorations */}
        <div className="vault-ring w-[600px] h-[600px] -top-64 -right-64 opacity-30"></div>
        <div className="vault-ring w-[400px] h-[400px] -bottom-32 -left-32 opacity-20"></div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* Pill badge */}
            <div className="animate-fade-in inline-flex items-center space-x-2 bg-primary-light border border-primary/20 rounded-full px-4 py-2 mb-8">
              <Leaf className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">Your Health Sanctuary</span>
            </div>

            <h1 className="animate-slide-up text-foreground mb-8">
              A Safe Place for Your
              <br />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Health Story
              </span>
            </h1>

            <p className="animate-slide-up delay-100 text-xl lg:text-2xl text-foreground-muted mb-12 leading-relaxed max-w-3xl mx-auto font-body">
              MediVault is your personal health sanctuary. Securely store medical documents, track symptoms, and gain meaningful insights - all in one calm, protected space.
            </p>

            <div className="animate-slide-up delay-200 flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
              <Button
                size="lg"
                onClick={() => handleGetStarted('hero')}
                className="btn-sanctuary text-lg px-8 py-6 group"
              >
                Start Your Health Journey
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
              <div className="flex items-center space-x-2 text-foreground-muted">
                <Lock className="h-4 w-4 text-primary" />
                <span className="text-sm font-body">100% Private & Secure</span>
              </div>
            </div>

            {/* Feature preview cards */}
            <div className="animate-slide-up delay-300 grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {/* Secure Storage Card */}
              <Card className="card-vault group transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted font-body">Secure Storage</span>
                    <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center">
                      <Lock className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { name: "Blood Work Results", date: "Dec 15", icon: "pdf" },
                      { name: "Annual Physical", date: "Nov 28", icon: "doc" },
                      { name: "Vaccination Record", date: "Oct 12", icon: "pdf" }
                    ].map((item, index) => (
                      <div key={index} className="flex items-center space-x-3 p-2 rounded-lg bg-surface-1 group-hover:bg-surface-2 transition-colors">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <span className="text-sm text-foreground font-medium font-body">{item.name}</span>
                          <p className="text-xs text-foreground-subtle">{item.date}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Symptom Tracking Card */}
              <Card className="card-vault group transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted font-body">Symptom Tracking</span>
                    <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-secondary" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="p-3 bg-surface-1 rounded-xl border border-border">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-foreground font-body">This Week</span>
                        <span className="text-xs text-primary font-medium">Improving</span>
                      </div>
                      <div className="flex items-end space-x-1 h-12">
                        {[40, 55, 35, 60, 45, 30, 25].map((height, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t bg-gradient-to-t from-primary to-primary/60"
                            style={{ height: `${height}%` }}
                          ></div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-foreground-muted">
                      <Heart className="w-4 h-4 text-rose-400" />
                      <span className="font-body">3 patterns identified</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Privacy Card */}
              <Card className="card-vault group transition-all duration-300 hover:-translate-y-1">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-medium text-foreground-muted font-body">Your Privacy</span>
                    <div className="w-8 h-8 rounded-lg bg-primary-light flex items-center justify-center">
                      <Fingerprint className="w-4 h-4 text-primary" />
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { label: "Sign-in required to open files", checked: true },
                      { label: "You own your data", checked: true },
                      { label: "No data selling", checked: true }
                    ].map((item, index) => (
                      <div key={index} className="flex items-center space-x-3">
                        <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                          <CheckCircle className="w-3 h-3 text-primary" />
                        </div>
                        <span className="text-sm text-foreground font-body">{item.label}</span>
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
      <section className="py-24 bg-surface-1 relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 bg-card border border-border rounded-full px-4 py-2 mb-6">
              <Eye className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground-muted font-body">Thoughtfully Designed</span>
            </div>
            <h2 className="text-foreground mb-6">
              Health Management,
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Reimagined</span>
            </h2>
            <p className="text-xl text-foreground-muted max-w-3xl mx-auto leading-relaxed font-body">
              We believe managing your health should feel calming, not overwhelming. Every feature is designed with your wellbeing in mind.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {[
              {
                icon: FileText,
                title: "Organized Records",
                description: "Upload and categorize medical documents with ease. Lab results, prescriptions, imaging - everything in its place, easy to find when you need it.",
                color: "primary"
              },
              {
                icon: Activity,
                title: "Gentle Tracking",
                description: "Log symptoms and health notes at your own pace. Track patterns over time with visual insights that help you understand your body better.",
                color: "secondary"
              },
              {
                icon: Shield,
                title: "Protected Always",
                description: "Your files stay in your account. Opening a file checks that the document belongs to you.",
                color: "primary"
              },
              {
                icon: Heart,
                title: "Personal Insights",
                description: "Discover connections in your health data. Understand how symptoms relate to lifestyle, and prepare better for doctor visits.",
                color: "rose"
              },
              {
                icon: Lock,
                title: "Privacy First",
                description: "We never sell your data. You maintain complete ownership and control over your health information, always.",
                color: "primary"
              },
              {
                icon: Leaf,
                title: "Calm Experience",
                description: "No overwhelming dashboards or anxiety-inducing alerts. Just a peaceful space to manage your health journey mindfully.",
                color: "secondary"
              }
            ].map((feature, index) => (
              <Card
                key={index}
                className="card-sanctuary group p-8 transition-all duration-300 hover:-translate-y-1"
              >
                <CardContent className="p-0">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110 ${
                    feature.color === 'primary' ? 'bg-primary-light' :
                    feature.color === 'secondary' ? 'bg-secondary/10' :
                    'bg-rose-50 dark:bg-rose-900/20'
                  }`}>
                    <feature.icon className={`w-6 h-6 ${
                      feature.color === 'primary' ? 'text-primary' :
                      feature.color === 'secondary' ? 'text-secondary' :
                      'text-rose-500'
                    }`} />
                  </div>
                  <h3 className="text-xl font-semibold mb-4 text-foreground">{feature.title}</h3>
                  <p className="text-foreground-muted leading-relaxed font-body">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] blob-bg bg-primary/5"></div>

        <div className="relative max-w-7xl mx-auto px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="text-foreground mb-6">
              Built on
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"> Trust</span>
            </h2>
            <p className="text-xl text-foreground-muted leading-relaxed font-body">
              Your health information is precious. We treat it with the care and respect it deserves.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                stat: "Owner",
                label: "Checked downloads",
                description: "Opening a file succeeds only if the document belongs to your account"
              },
              {
                stat: "Zero",
                label: "Data Selling",
                description: "We will never sell, share, or monetize your personal health information"
              },
              {
                stat: "100%",
                label: "Your Control",
                description: "Export or delete your data anytime. You own it, completely"
              }
            ].map((item, index) => (
              <div key={index} className="text-center p-8">
                <p className="text-5xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent mb-2 font-display">
                  {item.stat}
                </p>
                <p className="text-lg font-semibold text-foreground mb-3 font-display">{item.label}</p>
                <p className="text-foreground-muted font-body">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5"></div>
        <div className="vault-ring w-[500px] h-[500px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"></div>

        <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
          <div className="inline-flex items-center space-x-2 bg-primary-light border border-primary/20 rounded-full px-4 py-2 mb-8">
            <Heart className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium text-primary font-body">Join the Waitlist</span>
          </div>

          <h2 className="text-foreground mb-8">
            Ready to Take Control of
            <br />
            <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              Your Health Journey?
            </span>
          </h2>

          <p className="text-xl text-foreground-muted mb-12 leading-relaxed max-w-2xl mx-auto font-body">
            Be among the first to experience a calmer, more organized approach to managing your health. Join our waitlist today.
          </p>

          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-12">
            <Button
              size="lg"
              onClick={() => handleGetStarted('cta_section')}
              className="btn-sanctuary text-lg px-10 py-6 group"
            >
              Reserve Your Spot
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>

          <div className="flex items-center justify-center flex-wrap gap-6 text-foreground-muted">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-primary" />
              <span className="text-sm font-body">Free to start</span>
            </div>
            <div className="flex items-center space-x-2">
              <Lock className="h-4 w-4 text-primary" />
              <span className="text-sm font-body">Privacy guaranteed</span>
            </div>
            <div className="flex items-center space-x-2">
              <Heart className="h-4 w-4 text-primary" />
              <span className="text-sm font-body">Made with care</span>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 bg-surface-1 border-t border-border">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center">
            <div className="flex items-center justify-center mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
                <Shield className="text-white h-5 w-5" />
              </div>
              <span className="ml-3 text-xl font-semibold text-foreground font-display">MediVault</span>
            </div>
            <p className="mb-8 leading-relaxed max-w-xl mx-auto text-foreground-muted font-body">
              A calm, secure sanctuary for your health information. Organize your medical journey with peace of mind.
            </p>

            <div className="flex flex-col md:flex-row justify-between items-center pt-8 border-t border-border">
              <p className="text-foreground-subtle text-sm font-body">
                &copy; {new Date().getFullYear()} MediVault. All rights reserved.
              </p>
              <div className="flex items-center mt-4 md:mt-0 space-x-6 text-sm text-foreground-muted font-body">
                <a href="#" className="hover:text-primary transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-primary transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-primary transition-colors">Contact</a>
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
