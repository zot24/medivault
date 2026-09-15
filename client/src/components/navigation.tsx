import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Shield, FileText, FolderOpen, LayoutDashboard, LogOut, Settings, User, Activity, Sun, Moon } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/documents", label: "Documents", icon: FileText },
    { href: "/import", label: "Import a disc", icon: FolderOpen },
    { href: "/symptoms", label: "Symptoms", icon: Activity },
  ];

  const getUserInitials = () => {
    if ((user as any)?.firstName && (user as any)?.lastName) {
      return `${(user as any).firstName.charAt(0)}${(user as any).lastName.charAt(0)}`.toUpperCase();
    }
    return (user as any)?.email?.charAt(0).toUpperCase() || "U";
  };

  return (
    <nav className="nav-sanctuary sticky top-0 z-50 transition-all duration-200">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center group">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center group-hover:scale-105 transition-all duration-200 shadow-lg shadow-primary/20">
                  <Shield className="text-white h-5 w-5" />
                </div>
              </div>
              <span className="text-xl font-semibold text-foreground font-display">MediVault</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;

              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-200 font-body ${
                      isActive
                        ? "bg-primary-light text-primary border border-primary/20"
                        : "text-foreground-muted hover:text-foreground hover:bg-surface-1"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm">{item.label}</span>
                  </button>
                </Link>
              );
            })}
          </div>

          {/* Right side: Mobile nav + Theme Toggle + User Menu */}
          <div className="flex items-center space-x-2">
            {/* Mobile navigation icons */}
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
                          ? "bg-primary-light text-primary border border-primary/20"
                          : "text-foreground-muted hover:text-foreground hover:bg-surface-1"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  </Link>
                );
              })}
            </div>

            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-9 w-9 rounded-xl text-foreground-muted hover:text-foreground hover:bg-surface-1"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* User Menu - always visible */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-10 w-10 rounded-full hover:bg-surface-1">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={(user as any)?.profileImageUrl || ""} alt={(user as any)?.firstName || ""} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-white text-sm font-medium font-body">
                      {getUserInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-64 p-2 bg-card border border-border rounded-2xl shadow-sanctuary-lg" align="end" forceMount>
                <div className="flex flex-col space-y-2 p-3 rounded-xl bg-surface-1">
                  <p className="text-sm font-medium text-foreground font-body">
                    {(user as any)?.firstName && (user as any)?.lastName
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : "User"
                    }
                  </p>
                  <p className="text-xs text-foreground-muted font-body">
                    {(user as any)?.email}
                  </p>
                </div>
                <div className="mt-2 space-y-1">
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="flex items-center px-3 py-2.5 rounded-xl hover:bg-surface-1 transition-colors duration-200">
                      <User className="mr-3 h-4 w-4 text-foreground-muted" />
                      <span className="text-sm text-foreground font-body">Profile</span>
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/settings" className="flex items-center px-3 py-2.5 rounded-xl hover:bg-surface-1 transition-colors duration-200">
                      <Settings className="mr-3 h-4 w-4 text-foreground-muted" />
                      <span className="text-sm text-foreground font-body">Settings</span>
                    </Link>
                  </DropdownMenuItem>
                  <div className="h-px bg-border my-2" />
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="flex items-center px-3 py-2.5 rounded-xl hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 cursor-pointer"
                  >
                    <LogOut className="mr-3 h-4 w-4" />
                    <span className="text-sm font-body">Log out</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </nav>
  );
}
