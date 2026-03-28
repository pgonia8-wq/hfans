import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/store/use-auth-store";
import { Loader2, Star, DollarSign, Lock, Users, ChevronRight, Check, Plus, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STEPS = ["basics", "pricing", "tiers", "done"] as const;
type Step = typeof STEPS[number];

const DEFAULT_TIER = {
  name: "Fan",
  description: "Access to all exclusive posts",
  priceWld: "2.0",
  benefits: ["All subscriber posts", "Private feed", "Direct messages"],
  trialDays: 0,
  bundle3moDiscountPct: 10,
  bundle6moDiscountPct: 15,
  bundle12moDiscountPct: 20,
};

export default function BecomeCreator() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("basics");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [subscriptionPriceWld, setSubscriptionPriceWld] = useState("2.0");
  const [paidDmPriceWld, setPaidDmPriceWld] = useState("");
  const [minTipWld, setMinTipWld] = useState("0.1");
  const [freeTrialDays, setFreeTrialDays] = useState(0);
  const [tiers, setTiers] = useState([{ ...DEFAULT_TIER }]);

  const addTier = () => {
    if (tiers.length >= 3) return;
    setTiers(t => [...t, { ...DEFAULT_TIER, name: "VIP", priceWld: "5.0", trialDays: 0 }]);
  };

  const removeTier = (i: number) => {
    if (tiers.length <= 1) return;
    setTiers(t => t.filter((_, idx) => idx !== i));
  };

  const updateTier = (i: number, key: string, value: any) => {
    setTiers(t => t.map((tier, idx) => idx === i ? { ...tier, [key]: value } : tier));
  };

  const updateTierBenefit = (tierIdx: number, benefitIdx: number, value: string) => {
    setTiers(t => t.map((tier, idx) => {
      if (idx !== tierIdx) return tier;
      const benefits = [...tier.benefits];
      benefits[benefitIdx] = value;
      return { ...tier, benefits };
    }));
  };

  const addBenefit = (tierIdx: number) => {
    setTiers(t => t.map((tier, idx) => {
      if (idx !== tierIdx) return tier;
      return { ...tier, benefits: [...tier.benefits, ""] };
    }));
  };

  const removeBenefit = (tierIdx: number, bIdx: number) => {
    setTiers(t => t.map((tier, idx) => {
      if (idx !== tierIdx) return tier;
      return { ...tier, benefits: tier.benefits.filter((_, bi) => bi !== bIdx) };
    }));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Create creator profile
      const r = await fetch("/api/creator/become-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          subscriptionPriceWld,
          paidDmPriceWld: paidDmPriceWld || undefined,
          minTipWld,
          freeTrialDays,
        }),
      });
      const data = await r.json() as { user?: any; error?: string };
      if (!r.ok) throw new Error(data.error || "Failed to create profile");
      if (data.user) setUser(data.user);

      // 2. Create tiers
      for (const tier of tiers) {
        await fetch("/api/creator/tiers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(tier),
        });
      }

      setStep("done");
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  if (user?.role === "creator") {
    navigate("/dashboard");
    return null;
  }

  return (
    <AppLayout title="Become a Creator" hideBottomNav>
      <div className="p-4 max-w-lg mx-auto space-y-6 pb-10">
        {/* Step indicator */}
        <div className="flex items-center gap-2 justify-center">
          {STEPS.filter(s => s !== "done").map((s, i) => {
            const stepIdx = STEPS.indexOf(step);
            const sIdx = STEPS.indexOf(s);
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  sIdx < stepIdx ? "bg-green-500 text-black" : sIdx === stepIdx ? "bg-primary text-black" : "bg-white/10 text-muted-foreground"
                }`}>
                  {sIdx < stepIdx ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                {i < 2 && <div className={`h-0.5 w-8 ${sIdx < stepIdx ? "bg-green-500" : "bg-white/10"}`} />}
              </div>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {/* ── STEP 1: Basics ─────────────────────────────────────────────── */}
          {step === "basics" && (
            <motion.div key="basics" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-4">
              <div>
                <h2 className="text-2xl font-bold mb-1">Your Creator Profile</h2>
                <p className="text-muted-foreground text-sm">Tell fans who you are</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Display Name</label>
                <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" className="bg-white/8 border-white/15 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Bio</label>
                <Textarea value={bio} onChange={e => setBio(e.target.value)} placeholder="Tell fans what kind of content you create..." rows={3} className="bg-white/8 border-white/15 rounded-xl resize-none" />
              </div>
              <Button className="w-full rounded-2xl h-12" onClick={() => setStep("pricing")} disabled={!displayName.trim()}>
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* ── STEP 2: Pricing ─────────────────────────────────────────────── */}
          {step === "pricing" && (
            <motion.div key="pricing" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold mb-1">Monetization Settings</h2>
                <p className="text-muted-foreground text-sm">Set your base prices. You'll configure tiers next.</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><DollarSign className="w-3.5 h-3.5" />Base sub price</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0.1" step="0.1" value={subscriptionPriceWld} onChange={e => setSubscriptionPriceWld(e.target.value)} className="bg-transparent border-0 p-0 text-xl font-bold w-20 focus-visible:ring-0" />
                    <span className="text-muted-foreground text-sm">WLD/mo</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Lock className="w-3.5 h-3.5" />Paid DMs</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" step="0.1" value={paidDmPriceWld} onChange={e => setPaidDmPriceWld(e.target.value)} placeholder="Free" className="bg-transparent border-0 p-0 text-xl font-bold w-20 focus-visible:ring-0" />
                    <span className="text-muted-foreground text-sm">WLD</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Star className="w-3.5 h-3.5" />Min tip</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0.01" step="0.01" value={minTipWld} onChange={e => setMinTipWld(e.target.value)} className="bg-transparent border-0 p-0 text-xl font-bold w-20 focus-visible:ring-0" />
                    <span className="text-muted-foreground text-sm">WLD</span>
                  </div>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Users className="w-3.5 h-3.5" />Free trial</div>
                  <div className="flex items-center gap-2">
                    <Input type="number" min="0" max="30" value={freeTrialDays} onChange={e => setFreeTrialDays(parseInt(e.target.value) || 0)} className="bg-transparent border-0 p-0 text-xl font-bold w-20 focus-visible:ring-0" />
                    <span className="text-muted-foreground text-sm">days</span>
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4 text-sm text-primary/90">
                <strong>Platform fee:</strong> H Fans takes 20%. You keep 80% of every payment. Funds are held in WLD and paid out on request.
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-2xl h-12 border-white/15" onClick={() => setStep("basics")}>Back</Button>
                <Button className="flex-1 rounded-2xl h-12" onClick={() => setStep("tiers")}>
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Tiers ───────────────────────────────────────────────── */}
          {step === "tiers" && (
            <motion.div key="tiers" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold mb-1">Subscription Tiers</h2>
                <p className="text-muted-foreground text-sm">Create up to 3 tiers with different prices and perks</p>
              </div>

              {tiers.map((tier, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm">Tier {i + 1}</span>
                    {tiers.length > 1 && (
                      <button onClick={() => removeTier(i)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Tier name</label>
                      <Input value={tier.name} onChange={e => updateTier(i, "name", e.target.value)} className="bg-white/8 border-white/15 rounded-xl h-9 text-sm" placeholder="Fan" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Price (WLD/mo)</label>
                      <Input type="number" min="0.1" step="0.1" value={tier.priceWld} onChange={e => updateTier(i, "priceWld", e.target.value)} className="bg-white/8 border-white/15 rounded-xl h-9 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
                    <Input value={tier.description} onChange={e => updateTier(i, "description", e.target.value)} className="bg-white/8 border-white/15 rounded-xl h-9 text-sm" placeholder="Access to exclusive content" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-2 block">Benefits (shown to fans)</label>
                    <div className="space-y-1.5">
                      {tier.benefits.map((b, bi) => (
                        <div key={bi} className="flex gap-2">
                          <Input value={b} onChange={e => updateTierBenefit(i, bi, e.target.value)} className="bg-white/8 border-white/15 rounded-xl h-8 text-sm flex-1" placeholder="Benefit..." />
                          <button onClick={() => removeBenefit(i, bi)} className="text-red-400 hover:text-red-300 px-2">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {tier.benefits.length < 6 && (
                        <button onClick={() => addBenefit(i)} className="text-xs text-primary flex items-center gap-1 mt-1">
                          <Plus className="w-3 h-3" /> Add benefit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[["3mo", "bundle3moDiscountPct", 10], ["6mo", "bundle6moDiscountPct", 15], ["12mo", "bundle12moDiscountPct", 20]].map(([label, key, def]) => (
                      <div key={label as string}>
                        <label className="text-xs text-muted-foreground mb-1 block">{label} discount</label>
                        <div className="flex items-center gap-1">
                          <Input type="number" min="0" max="100" value={(tier as any)[key as string]} onChange={e => updateTier(i, key as string, parseInt(e.target.value) || 0)} className="bg-white/8 border-white/15 rounded-xl h-8 text-sm w-14" />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Free trial (days)</label>
                    <Input type="number" min="0" max="30" value={tier.trialDays} onChange={e => updateTier(i, "trialDays", parseInt(e.target.value) || 0)} className="bg-white/8 border-white/15 rounded-xl h-8 text-sm w-24" />
                  </div>
                </div>
              ))}

              {tiers.length < 3 && (
                <button onClick={addTier} className="w-full py-3 border border-dashed border-white/20 rounded-2xl text-muted-foreground text-sm flex items-center justify-center gap-2 hover:bg-white/5 transition-colors">
                  <Plus className="w-4 h-4" /> Add another tier
                </button>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm">{error}</div>
              )}

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 rounded-2xl h-12 border-white/15" onClick={() => setStep("pricing")}>Back</Button>
                <Button className="flex-1 rounded-2xl h-12" onClick={handleSubmit} disabled={isLoading}>
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Launch Profile"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── DONE ─────────────────────────────────────────────────────────── */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center text-center gap-6 py-10">
              <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                <Star className="w-10 h-10 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-2">You're a Creator!</h2>
                <p className="text-muted-foreground">Your profile is live. Start posting content and fans can subscribe with WLD.</p>
              </div>
              <Button className="w-full rounded-2xl h-12" onClick={() => navigate("/dashboard")}>
                Go to Creator Dashboard
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}
