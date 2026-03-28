import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLocation } from "wouter";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuthStore } from "@/store/use-auth-store";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Image, Video, Lock, Globe, DollarSign, X, Loader2, Check, ChevronDown,
  Users, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type PostAccess = "subscribers" | "ppv" | "free";

export default function CreatePost() {
  const { user } = useAuthStore();
  const [, setLocation] = useLocation();

  const [text, setText] = useState("");
  const [access, setAccess] = useState<PostAccess>("subscribers");
  const [ppvPrice, setPpvPrice] = useState("2.0");
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaPreviews, setMediaPreviews] = useState<string[]>([]);
  const [isPosting, setIsPosting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPriceInput, setShowPriceInput] = useState(false);

  if (user?.role !== "creator" && user?.role !== "admin") {
    setLocation("/");
    return null;
  }

  const handleMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + mediaFiles.length > 10) {
      setError("Max 10 files per post");
      return;
    }
    setMediaFiles(prev => [...prev, ...files]);
    files.forEach(f => {
      const url = URL.createObjectURL(f);
      setMediaPreviews(prev => [...prev, url]);
    });
  };

  const removeMedia = (i: number) => {
    setMediaFiles(prev => prev.filter((_, idx) => idx !== i));
    setMediaPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const handlePost = async () => {
    if (!text.trim() && mediaFiles.length === 0) {
      setError("Add some text or media to post");
      return;
    }
    setIsPosting(true); setError(null);
    try {
      const formData = new FormData();
      formData.append("text", text.trim());
      formData.append("isPpv", access === "ppv" ? "true" : "false");
      formData.append("ppvPriceWld", access === "ppv" ? ppvPrice : "0");
      formData.append("isFreeForSubscribers", access !== "ppv" ? "true" : "false");
      formData.append("isPublished", "true");
      formData.append("postType", mediaFiles.length > 0 ? (mediaFiles[0].type.startsWith("video") ? "video" : "photo") : "text");
      mediaFiles.forEach(f => formData.append("media", f));

      const r = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await r.json() as { error?: string };
      if (!r.ok) throw new Error(data.error || "Post failed");
      setSuccess(true);
      setTimeout(() => setLocation("/creator-dashboard"), 1500);
    } catch (e: any) { setError(e.message); }
    finally { setIsPosting(false); }
  };

  const accessOptions = [
    { value: "subscribers" as PostAccess, icon: Lock, label: "Subscribers Only", sub: "Only your paid subscribers can see this", color: "text-primary" },
    { value: "free" as PostAccess, icon: Globe, label: "Free for Everyone", sub: "Visible to all users", color: "text-green-400" },
    { value: "ppv" as PostAccess, icon: DollarSign, label: "Pay-Per-View", sub: "Set a separate price per view", color: "text-amber-400" },
  ];

  if (success) {
    return (
      <AppLayout hideTopBar>
        <div className="h-[100dvh] flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <p className="text-xl font-bold">Posted!</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="New Post" onBack={() => setLocation("/creator-dashboard")}>
      <div className="p-4 space-y-5 pb-10">

        {/* Text area */}
        <Textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="What's on your mind? Share something exclusive..."
          rows={5}
          className="bg-white/5 border-white/10 rounded-2xl resize-none text-base placeholder:text-muted-foreground/50"
        />

        {/* Media previews */}
        {mediaPreviews.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {mediaPreviews.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-secondary">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeMedia(i)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center"
                >
                  <X className="w-3 h-3 text-white" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Media upload */}
        <div className="flex gap-2">
          <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/8 transition-colors text-sm text-muted-foreground">
            <Image className="w-4 h-4" />
            Photo
            <input type="file" accept="image/*" multiple className="hidden" onChange={handleMediaSelect} />
          </label>
          <label className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl cursor-pointer hover:bg-white/8 transition-colors text-sm text-muted-foreground">
            <Video className="w-4 h-4" />
            Video
            <input type="file" accept="video/*" multiple className="hidden" onChange={handleMediaSelect} />
          </label>
        </div>

        {/* Access control */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Who can see this</p>
          <div className="space-y-2">
            {accessOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => { setAccess(opt.value); if (opt.value === "ppv") setShowPriceInput(true); }}
                className={cn(
                  "w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all",
                  access === opt.value ? "border-primary/50 bg-primary/10" : "border-white/10 bg-white/5 hover:bg-white/8"
                )}
              >
                <opt.icon className={cn("w-4 h-4 flex-shrink-0", opt.color)} />
                <div className="flex-1">
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.sub}</div>
                </div>
                {access === opt.value && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>

          {/* PPV price */}
          <AnimatePresence>
            {access === "ppv" && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="pt-2 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <DollarSign className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <Input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={ppvPrice}
                    onChange={e => setPpvPrice(e.target.value)}
                    className="bg-transparent border-0 p-0 text-xl font-bold w-24 focus-visible:ring-0 text-amber-400"
                  />
                  <span className="text-amber-400/70">WLD per view</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">{error}</div>
        )}

        <Button
          className="w-full h-13 rounded-2xl text-base font-semibold"
          onClick={handlePost}
          disabled={isPosting || (!text.trim() && mediaFiles.length === 0)}
        >
          {isPosting ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Zap className="w-5 h-5 mr-2" />}
          {isPosting ? "Posting..." : "Publish Post"}
        </Button>
      </div>
    </AppLayout>
  );
}
