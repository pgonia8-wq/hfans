import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";
import { ArrowLeft, Bell } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";

interface AppLayoutProps {
  children: ReactNode;
  hideTopBar?: boolean;
  hideBottomNav?: boolean;
  title?: string;
  backButton?: boolean;
}

function TopBar({ title, backButton }: { title?: string, backButton?: boolean }) {
  const [, setLocation] = useLocation();
  
  return (
    <header className="sticky top-0 z-40 h-14 flex items-center justify-between px-4 border-b border-white/5 bg-background/80 backdrop-blur-xl">
      <div className="flex items-center w-1/3">
        {backButton && (
          <button onClick={() => window.history.back()} className="p-2 -ml-2 rounded-full hover:bg-white/5 text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <div className="w-1/3 text-center">
        {title ? (
          <h1 className="font-semibold text-lg">{title}</h1>
        ) : (
          <span className="text-xl font-bold text-primary tracking-tight">H Fans</span>
        )}
      </div>
      
      <div className="flex items-center justify-end w-1/3">
        <button onClick={() => setLocation('/notifications')} className="p-2 -mr-2 rounded-full hover:bg-white/5 text-foreground transition-colors relative">
          <Bell className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}

export function AppLayout({ children, hideTopBar, hideBottomNav, title, backButton }: AppLayoutProps) {
  const { isAuthenticated } = useAuthStore();

  return (
    <div className="flex justify-center bg-black min-h-[100dvh] w-full relative">
      <div className="w-full max-w-md bg-background flex flex-col h-[100dvh] overflow-hidden relative shadow-2xl shadow-primary/5">
        
        {!hideTopBar && isAuthenticated && (
          <TopBar title={title} backButton={backButton} />
        )}
        
        <main className={cn(
          "flex-1 overflow-y-auto overflow-x-hidden relative",
          !hideBottomNav && isAuthenticated ? "pb-20" : ""
        )}>
          {children}
        </main>

        {!hideBottomNav && isAuthenticated && <BottomNav />}
      </div>
    </div>
  );
}
