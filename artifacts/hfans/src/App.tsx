import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MiniKitProvider } from "@/components/MiniKitProvider";
import { useAuthStore } from "@/store/use-auth-store";
import { useGetMe } from "@workspace/api-client-react";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

// Page Imports
import { AuthScreen } from "@/pages/auth";
import Home from "@/pages/home";
import Explore from "@/pages/explore";
import CreatorProfile from "@/pages/creator-profile";
import Dashboard from "@/pages/dashboard";
import Profile from "@/pages/profile";
import NotFound from "@/pages/not-found";

// Stub components for missing pages to ensure completeness
function MessagesStub() {
  return (
    <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-[100dvh] bg-background">
      <h2 className="text-xl font-semibold text-foreground mb-2">Messages</h2>
      <p>Your inbox is empty.</p>
    </div>
  );
}

function LiveStub() {
  return (
    <div className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center h-[100dvh] bg-background">
      <h2 className="text-xl font-semibold text-foreground mb-2">Live Streams</h2>
      <p>No active streams right now.</p>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { user, setUser } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const { data, status } = useGetMe({ 
    query: { retry: false } 
  });

  useEffect(() => {
    if (status === "success") {
      setUser(data);
      setChecking(false);
    } else if (status === "error") {
      setUser(null);
      setChecking(false);
    }
  }, [data, status, setUser]);

  // Fallback: if checking takes more than 3 seconds, give up and show auth
  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (checking) {
    return (
      <div className="min-h-[100dvh] w-full flex items-center justify-center bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/explore" component={Explore} />
      <Route path="/creator/:username" component={CreatorProfile} />
      <Route path="/messages" component={MessagesStub} />
      <Route path="/live" component={LiveStub} />
      <Route path="/profile" component={Profile} />
      <Route path="/creator-dashboard" component={Dashboard} />
      {/* Catch-all */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MiniKitProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AuthWrapper>
              <Router />
            </AuthWrapper>
          </WouterRouter>
        </MiniKitProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
