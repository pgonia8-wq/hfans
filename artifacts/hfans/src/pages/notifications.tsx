import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Loader2, Bell, Heart, UserPlus, DollarSign, Star, MessageCircle } from "lucide-react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  metadata?: any;
}

const ICON_MAP: Record<string, { icon: any; color: string; bg: string }> = {
  new_subscriber: { icon: UserPlus, color: "text-primary", bg: "bg-primary/20" },
  new_like: { icon: Heart, color: "text-red-400", bg: "bg-red-500/20" },
  new_tip: { icon: DollarSign, color: "text-amber-400", bg: "bg-amber-500/20" },
  new_message: { icon: MessageCircle, color: "text-blue-400", bg: "bg-blue-500/20" },
  ppv_unlock: { icon: Star, color: "text-yellow-400", bg: "bg-yellow-500/20" },
  default: { icon: Bell, color: "text-muted-foreground", bg: "bg-white/10" },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Notifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    fetch("/api/notifications", { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setNotifications(data.notifications || []);
        setIsLoading(false);
        // Mark all as read
        fetch("/api/notifications/read-all", { method: "POST", credentials: "include" }).catch(() => {});
      })
      .catch(() => setIsLoading(false));
  }, []);

  const handleNotifClick = (notif: Notification) => {
    if (notif.type === "new_subscriber" && notif.metadata?.fanId) {
      setLocation(`/creator-dashboard`);
    } else if (notif.type === "new_message") {
      setLocation(`/messages`);
    }
  };

  return (
    <AppLayout title="Notifications">
      <div className="p-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-muted-foreground">
            <Bell className="w-12 h-12 opacity-20" />
            <p className="text-sm">No notifications yet</p>
            <p className="text-xs text-center max-w-[200px]">
              Activity from your subscriptions and fans will appear here
            </p>
          </div>
        ) : (
          notifications.map(notif => {
            const { icon: Icon, color, bg } = ICON_MAP[notif.type] || ICON_MAP.default;
            return (
              <button
                key={notif.id}
                onClick={() => handleNotifClick(notif)}
                className={cn(
                  "w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-colors",
                  notif.isRead ? "hover:bg-white/5" : "bg-white/5 border border-white/8 hover:bg-white/8"
                )}
              >
                <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0", bg)}>
                  <Icon className={cn("w-5 h-5", color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-sm font-medium leading-snug", !notif.isRead && "text-foreground")}>
                      {notif.title}
                    </p>
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {timeAgo(notif.createdAt)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.body}</p>
                </div>
                {!notif.isRead && (
                  <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-2" />
                )}
              </button>
            );
          })
        )}
      </div>
    </AppLayout>
  );
}
