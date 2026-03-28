import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/use-auth-store";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLogout } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import {
  User, Shield, Bell, Wallet, LogOut, ChevronRight,
  Save, Loader2, ShieldCheck, Check
} from "lucide-react";
import { MiniKit } from "@worldcoin/minikit-js";
import { cn } from "@/lib/utils";

type Section = "main" | "profile" | "notifications" | "wallet";

export default function Settings() {
  const { user, setUser, logout: localLogout } = useAuthStore();
  const logoutMutation = useLogout();
  const [, setLocation] = useLocation();
  const [section, setSection] = useState<Section>("main");
  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [username, setUsername] = useState(user?.username || "");
  const [twitter, setTwitter] = useState((user as any)?.twitterHandle || "");
  const [instagram, setInstagram] = useState((user as any)?.instagramHandle || "");

  const handleSaveProfile = async () => {
    setIsSaving(true); setError(null);
    try {
      const r = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ displayName, bio, username, twitterHandle: twitter, instagramHandle: instagram }),
      });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error || "Save failed");
      setUser(data.user || data);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e: any) { setError(e.message); }
    finally { setIsSaving(false); }
  };

  const handleWorldIdVerify = async () => {
    setIsVerifying(true);
    try {
      if (MiniKit.isInstalled()) {
        const { finalPayload } = await MiniKit.commandsAsync.verify({
          action: "hfans-verify",
          verification_level: "orb",
        });
        if (finalPayload.status !== "success") throw new Error("Verification failed");
        const r = await fetch("/api/auth/world-id/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payload: finalPayload, action: "hfans-verify" }),
        });
        const data = await r.json() as { verified?: boolean };
        if (data.verified && user) {
          setUser({ ...user, isWorldIdVerified: true });
        }
      } else {
        const r = await fetch("/api/auth/world-id/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ payload: { verification_level: "orb", nullifier_hash: "dev_hash_" + Date.now() }, action: "hfans-verify" }),
        });
        const data = await r.json() as { verified?: boolean };
        if (data.verified && user) setUser({ ...user, isWorldIdVerified: true });
      }
    } catch (e: any) { setError(e.message); }
    finally { setIsVerifying(false); }
  };

  const handleLogout = async () => {
    try { await logoutMutation.mutateAsync(); } catch {}
    localLogout();
    setLocation("/");
  };

  if (section === "profile") {
    return (
      <AppLayout title="Edit Profile" onBack={() => setSection("main")}>
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Username</label>
            <Input value={username} onChange={e => setUsername(e.target.value)} className="bg-white/8 border-white/15 rounded-xl" placeholder="username" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Display Name</label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className="bg-white/8 border-white/15 rounded-xl" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Bio</label>
            <Textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} className="bg-white/8 border-white/15 rounded-xl resize-none" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Twitter / X</label>
            <Input value={twitter} onChange={e => setTwitter(e.target.value)} className="bg-white/8 border-white/15 rounded-xl" placeholder="@handle" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Instagram</label>
            <Input value={instagram} onChange={e => setInstagram(e.target.value)} className="bg-white/8 border-white/15 rounded-xl" placeholder="@handle" />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <Button className="w-full rounded-2xl h-12" onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : saveSuccess ? <Check className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            {saveSuccess ? "Saved!" : "Save Changes"}
          </Button>
        </div>
      </AppLayout>
    );
  }

  const menuItems = [
    {
      icon: User, label: "Edit Profile", sub: "Name, bio, links", onClick: () => setSection("profile"),
    },
    {
      icon: Shield,
      label: "World ID Verification",
      sub: user?.isWorldIdVerified ? "Verified ✓" : "Not verified",
      badge: user?.isWorldIdVerified ? "verified" : "unverified",
      onClick: user?.isWorldIdVerified ? undefined : handleWorldIdVerify,
      loading: isVerifying,
    },
    {
      icon: Wallet, label: "Wallet", sub: user?.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : "Not connected", onClick: undefined,
    },
    {
      icon: Bell, label: "Notifications", sub: "Push & alerts", onClick: () => setSection("notifications"),
    },
  ];

  return (
    <AppLayout title="Settings">
      <div className="p-4 space-y-6">
        {/* Profile card */}
        <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-secondary">
            <img src={user?.avatarUrl || `${import.meta.env.BASE_URL}images/default-avatar.png`} alt="" className="w-full h-full object-cover" />
          </div>
          <div>
            <p className="font-bold text-lg">{user?.displayName || user?.username}</p>
            <p className="text-muted-foreground text-sm">@{user?.username}</p>
            {user?.isWorldIdVerified && (
              <div className="flex items-center gap-1 text-xs text-primary mt-1">
                <ShieldCheck className="w-3 h-3" /> World ID verified
              </div>
            )}
          </div>
        </div>

        {/* Menu */}
        <div className="space-y-1">
          {menuItems.map(item => (
            <button
              key={item.label}
              onClick={item.onClick}
              disabled={item.loading || !item.onClick}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-2xl transition-colors text-left",
                item.onClick ? "hover:bg-white/5 cursor-pointer" : "opacity-60 cursor-default"
              )}
            >
              <div className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center flex-shrink-0">
                {item.loading ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <item.icon className="w-4 h-4 text-muted-foreground" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.sub}</div>
              </div>
              {item.badge === "verified" ? (
                <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-[10px]">✓ Verified</Badge>
              ) : item.badge === "unverified" ? (
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">Verify</Badge>
              ) : item.onClick ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : null}
            </button>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm text-center">{error}</p>}

        <div className="border-t border-white/5 pt-4">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 p-4 rounded-2xl text-red-400 hover:bg-red-500/10 transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center">
              <LogOut className="w-4 h-4" />
            </div>
            <span className="font-medium">Log Out</span>
          </button>
        </div>

        <p className="text-center text-xs text-muted-foreground/50">H Fans v1.0 · 18+ Only</p>
      </div>
    </AppLayout>
  );
}
