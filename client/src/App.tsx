import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { SDKProvider } from "@/lib/sdk";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Documents from "@/pages/documents";
import Study from "@/pages/study";
import Symptoms from "@/pages/symptoms";
import SharedFile from "@/pages/shared-file";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/documents" component={Documents} />
      <Route path="/studies/:studyInstanceUid" component={Study} />
      <Route path="/symptoms" component={Symptoms} />
      <Route path="/s/:token" component={SharedFile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <QueryClientProvider client={queryClient}>
        <SDKProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </SDKProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
