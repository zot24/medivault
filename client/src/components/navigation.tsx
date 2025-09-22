import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, FileText, LayoutDashboard, LogOut, Settings, User, Activity, Brain } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/symptoms", label: "Symptoms", icon: Activity },
  ];

  const getUserInitials = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName.charAt(0)}${(user as any).lastName.charAt(0)}`.toUpperCase();
    }
    return (user as any)?.email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <nav className="nav-blur sticky top-0 z-50 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <div className="flex items-center space-x-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-primary to-secondary group-hover:scale-105 transition-all duration-200">
                <Brain className="text-white h-5 w-5" />
              </div>
              <span className="text-xl font-semibold text-foreground">MediVault</span>
            </div>
          </Link>

          {/* Navigation Items */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-white/10 text-foreground border border-white/20"
                        : "text-foreground-muted hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>

          {/* User Menu */}
          <div className="flex items-center space-x-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-white/10">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={(user as any)?.profileImageUrl || ""} alt={(user as any)?.firstName || ""} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm font-medium">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 p-2 bg-surface-1 border border-white/10 rounded-2xl" align="end" forceMount>
                <div className="flex flex-col space-y-2 p-3 rounded-xl bg-white/5">
                  <p className="text-sm font-medium text-foreground">
                    {(user as any)?.firstName && (user as any)?.lastName 
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : "User"
                    }
                  </p>
                  <p className="text-xs text-foreground-muted">
                    {(user as any)?.email}
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-200">
                      <User className="mr-3 h-4 w-4 text-foreground-muted" />
                      <span className="text-sm text-foreground">Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors duration-200">
                      <Settings className="mr-3 h-4 w-4 text-foreground-muted" />
                      <span className="text-sm text-foreground">Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <div className="h-px bg-white/10 my-2" />
                  <DropdownMenuItem 
                    onClick={handleLogout} 
                    className="flex items-center px-3 py-2.5 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 cursor-pointer"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    <span className="text-sm">Log out</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile navigation */}
          <div className="md:hidden flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-9 w-9 rounded-xl transition-all duration-200 ${
                      isActive 
                        ? "bg-white/10 text-foreground border border-white/20" 
                        : "text-foreground-muted hover:text-foreground hover:bg-white/5"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}