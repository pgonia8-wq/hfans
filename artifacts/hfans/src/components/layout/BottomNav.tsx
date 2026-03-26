import { Link, useLocation } from "wouter";
import { Home, Compass, Radio, MessageSquare, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/use-auth-store";

const navItems = [
  { icon: Home, label: "Home", href: "/" },
  { icon: Compass, label: "Explore", href: "/explore" },
  { icon: Radio, label: "Live", href: "/live" },
  { icon: MessageSquare, label: "Messages", href: "/messages" },
  { icon: User, label: "Profile", href: "/profile" },
];

export function BottomNav() {
  const [location] = useLocation();
  const { user } = useAuthStore();

  if (!user) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 glass-header border-t border-white/5 safe-area-pb">
      <div className="max-w-md mx-auto flex justify-between items-center px-6 h-16">
        {navItems.map((item) => {
          const isActive = location === item.href || 
            (item.href !== "/" && location.startsWith(item.href));
          
          return (
            <Link key={item.label} href={item.href} className="flex flex-col items-center justify-center w-full h-full gap-1 group">
              <div className={cn(
                "p-1.5 rounded-xl transition-all duration-300",
                isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}>
                <item.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
