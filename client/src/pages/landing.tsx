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
                <a href="#features" className="hover:text-medical-blue transition-colors duration-200" style={{ color: "hsl(215, 28%, 17%)" }}>Features</a>
                <a href="#security" className="hover:text-medical-blue transition-colors duration-200" style={{ color: "hsl(215, 28%, 17%)" }}>Security</a>
                <a href="#about" className="hover:text-medical-blue transition-colors duration-200" style={{ color: "hsl(215, 28%, 17%)" }}>About</a>
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
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-white">
              <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">
                your health,
                <span className="text-warm-amber"> finally organized</span>
              </h1>
              <p className="text-xl lg:text-2xl mb-8 text-blue-100 leading-relaxed">
                ditch the chaos. store your medical records, track symptoms, and stay on top of appointments — all in one simple, private app
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  size="lg"
                  onClick={handleGetStarted}
                  className="bg-health-green text-white hover:bg-emerald-600 font-semibold text-lg transform hover:scale-105 transition-all duration-200"
                >
                  start now
                </Button>
                <Button 
                  variant="outline" 
                  size="lg"
                  className="border-2 border-white text-white hover:bg-white hover:text-medical-blue font-semibold text-lg"
                >
                  watch demo
                </Button>
              </div>
              <div className="flex items-center mt-8 text-blue-100">
                <Lock className="mr-2 h-4 w-4" />
                <span className="text-sm">your data stays yours — encrypted storage, no ads</span>
              </div>
            </div>
            <div className="relative">
              <Card className="rounded-2xl shadow-2xl">
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium" style={{ color: "hsl(215, 15%, 45%)" }}>Dashboard Overview</span>
                      <div className="w-3 h-3 bg-health-green rounded-full"></div>
                    </div>
                    <div className="space-y-3">
                      <div className="h-3 bg-gray-200 rounded"></div>
                      <div className="h-3 bg-gray-200 rounded w-4/5"></div>
                      <div className="h-3 bg-gray-200 rounded w-3/5"></div>
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
              built for peace of mind
            </h2>
            <p className="text-xl max-w-3xl mx-auto" style={{ color: "hsl(215, 15%, 45%)" }}>
              whether you're dealing with chronic stuff or just want your medical life in order — medivault gives you the tools to actually manage your health
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Upload,
                emoji: "✅",
                title: "upload anything",
                description: "store lab results, prescriptions, images, and notes — auto-organized by date & type",
                color: "medical-blue"
              },
              {
                icon: Calendar,
                emoji: "📅",
                title: "timeline tracking",
                description: "see your full health journey — appointments, treatments, and key events in one clean view",
                color: "health-green"
              },
              {
                icon: Activity,
                emoji: "📓",
                title: "symptom tracking",
                description: "log symptoms in real-time and spot patterns over days, weeks, or months — finally see what your body's been trying to tell you",
                color: "trust-purple"
              },
              {
                icon: Search,
                emoji: "🔍",
                title: "lightning-fast search",
                description: "search by doctor, keyword, date, or condition — no more endless scrolling",
                color: "warm-amber"
              },
              {
                icon: Bell,
                emoji: "🔔",
                title: "smart reminders",
                description: "set nudges for meds, checkups, symptoms, or custom goals — stay on top of it all",
                color: "medical-blue"
              },
              {
                icon: Smartphone,
                emoji: "📱",
                title: "always with you",
                description: "access everything on mobile or desktop, wherever you are",
                color: "health-green"
              }
            ].map((feature, index) => (
              <Card key={index} className="p-8 border border-gray-100 hover:shadow-lg hover:border-medical-blue transition-all duration-200 group">
                <CardContent className="p-0">
                  <div className="mb-6">
                    <span className="text-4xl">{feature.emoji}</span>
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

      {/* Testimonial Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-12" style={{ color: "hsl(215, 28%, 17%)" }}>
            why people love medivault
          </h2>
          <Card className="p-8 border-none shadow-lg">
            <CardContent className="p-0">
              <blockquote className="text-xl lg:text-2xl leading-relaxed mb-6" style={{ color: "hsl(215, 28%, 17%)" }}>
                "i can actually show my doctor symptom trends and past lab results in seconds — makes appointments way less stressful"
              </blockquote>
              <p className="text-lg" style={{ color: "hsl(215, 15%, 45%)" }}>
                — someone tired of guessing what happened 3 months ago
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl lg:text-4xl font-bold mb-6" style={{ color: "hsl(215, 28%, 17%)" }}>
            ready to take control of your health?
          </h2>
          <p className="text-xl mb-8" style={{ color: "hsl(215, 15%, 45%)" }}>
            join people who are finally managing their medical life on their terms
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              onClick={handleGetStarted}
              className="bg-medical-blue text-white hover:bg-blue-700 font-semibold text-lg"
            >
              get started
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="border-2 border-medical-blue text-medical-blue hover:bg-medical-blue hover:text-white font-semibold text-lg"
            >
              see it in action
            </Button>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-20 bg-gradient-to-r from-clean-white to-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Card className="rounded-2xl shadow-xl">
                <CardContent className="p-8">
                  <div className="text-center">
                    <Shield className="w-16 h-16 text-trust-purple mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-professional-dark mb-4">Bank-Level Security</h3>
                    <p className="text-gray-600">Your medical data is protected with the same security standards used by financial institutions.</p>
                  </div>
                </CardContent>
              </Card>
            </div>
            <div>
              <h2 className="text-3xl lg:text-4xl font-bold text-professional-dark mb-6">
                Your Health Data is 
                <span className="text-trust-purple"> 100% Secure</span>
              </h2>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                We understand the sensitive nature of medical records. That's why we've implemented military-grade security measures to protect your information.
              </p>
              
              <div className="space-y-6">
                {[
                  {
                    icon: Shield,
                    title: "HIPAA Compliant",
                    description: "Full compliance with healthcare privacy regulations and standards.",
                    color: "trust-purple"
                  },
                  {
                    icon: Lock,
                    title: "End-to-End Encryption",
                    description: "256-bit AES encryption ensures your data is protected at all times.",
                    color: "medical-blue"
                  },
                  {
                    icon: UserCheck,
                    title: "Multi-Factor Authentication",
                    description: "Additional security layers to protect your account access.",
                    color: "health-green"
                  },
                  {
                    icon: Server,
                    title: "Secure Cloud Storage",
                    description: "SOC 2 compliant data centers with redundant backups.",
                    color: "warm-amber"
                  }
                ].map((item, index) => (
                  <div key={index} className="flex items-start">
                    <div className={`w-8 h-8 bg-${item.color} bg-opacity-10 rounded-lg flex items-center justify-center mr-4 mt-1`}>
                      <item.icon className={`text-${item.color} h-4 w-4`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-professional-dark mb-2">{item.title}</h4>
                      <p className="text-gray-600">{item.description}</p>
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
            Ready to Take Control of Your Health Records?
          </h2>
          <p className="text-xl text-blue-100 mb-10 leading-relaxed">
            Join thousands of patients who trust MedVault to securely manage their medical history. Start your free account today and experience the peace of mind that comes with organized healthcare.
          </p>
          <div className="flex flex-col sm:flex-row gap-6 justify-center">
            <Button 
              size="lg"
              onClick={handleGetStarted}
              className="bg-health-green text-white hover:bg-emerald-600 font-semibold text-lg transform hover:scale-105 transition-all duration-200"
            >
              Start Free Account
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="border-2 border-white text-white hover:bg-white hover:text-medical-blue font-semibold text-lg"
            >
              Schedule Demo
            </Button>
          </div>
          <div className="flex items-center justify-center mt-8 text-blue-100">
            <CheckCircle className="mr-2 h-4 w-4" />
            <span>Free forever • No credit card required • HIPAA compliant</span>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-professional-dark text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center mb-6">
                <Shield className="text-medical-blue text-2xl mr-3" />
                <span className="text-xl font-semibold">MediVault</span>
              </div>
              <p className="text-gray-300 mb-6 leading-relaxed">
                Empowering patients to take control of their healthcare journey through secure, organized medical record management.
              </p>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-3 text-gray-300">
                <li><a href="#features" className="hover:text-white transition-colors duration-200">Features</a></li>
                <li><a href="#security" className="hover:text-white transition-colors duration-200">Security</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200">Pricing</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200">Mobile App</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-4">Support</h4>
              <ul className="space-y-3 text-gray-300">
                <li><a href="#" className="hover:text-white transition-colors duration-200">Help Center</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition-colors duration-200">Contact Us</a></li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-700 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-400">© 2024 MediVault. All rights reserved.</p>
            <div className="flex items-center mt-4 md:mt-0">
              <Shield className="text-health-green mr-2 h-4 w-4" />
              <span className="text-gray-400 text-sm">HIPAA Compliant • SOC 2 Certified</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
