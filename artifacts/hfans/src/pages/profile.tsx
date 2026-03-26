import { useAuthStore } from "@/store/use-auth-store";
import { useLogout } from "@workspace/api-client-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { LogOut, Settings, CreditCard, LayoutDashboard, Star, Shield } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Profile() {
  const { user, logout: localLogout } = useAuthStore();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch(e) {}
    localLogout();
    setLocation("/");
  };

  if (!user) return null;

  const isCreator = user.role === "creator" || user.role === "admin";

  return (
    <AppLayout title="My Profile">
      <div className="p-4">
        {/* Profile Card */}
        <div className="bg-card border border-white/5 rounded-2xl p-4 flex items-center gap-4 mb-6 shadow-lg">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary">
            <img src={user.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">{user.displayName || user.username}</h2>
            <p className="text-sm text-muted-foreground">@{user.username}</p>
          </div>
        </div>

        {/* Menu Options */}
        <div className="space-y-2 mb-8">
          {isCreator && (
            <Link href="/creator-dashboard">
              <div className="flex items-center justify-between p-4 rounded-xl bg-primary/10 border border-primary/20 text-primary font-medium hover:bg-primary/20 transition-colors cursor-pointer">
                <div className="flex items-center gap-3">
                  <LayoutDashboard className="w-5 h-5" />
                  Creator Dashboard
                </div>
              </div>
            </Link>
          )}

          {!isCreator && (
            <Link href="/become-creator">
              <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-primary/20 to-blue-500/20 border border-primary/20 text-white font-medium hover:brightness-110 transition-all cursor-pointer">
                <div className="flex items-center gap-3">
                  <Star className="w-5 h-5 text-primary" />
                  Become a Creator
                </div>
              </div>
            </Link>
          )}

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 text-foreground">
              <CreditCard className="w-5 h-5 text-muted-foreground" />
              Cards & Payments
            </div>
          </div>
          
          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 text-foreground">
              <Shield className="w-5 h-5 text-muted-foreground" />
              World ID Verification
            </div>
            {user.isWorldIdVerified ? (
              <span className="text-xs text-primary bg-primary/10 px-2 py-1 rounded">Verified</span>
            ) : (
              <span className="text-xs text-muted-foreground bg-white/5 px-2 py-1 rounded">Pending</span>
            )}
          </div>

          <div className="flex items-center justify-between p-4 rounded-xl bg-card border border-white/5 hover:bg-white/5 transition-colors cursor-pointer">
            <div className="flex items-center gap-3 text-foreground">
              <Settings className="w-5 h-5 text-muted-foreground" />
              Settings
            </div>
          </div>
        </div>

        <Button variant="outline" className="w-full text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleLogout}>
          <LogOut className="w-4 h-4 mr-2" />
          Log Out
        </Button>
      </div>
    </AppLayout>
  );
}
