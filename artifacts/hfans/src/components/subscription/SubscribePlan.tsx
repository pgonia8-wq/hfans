import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/use-auth-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, Check, Tag, ChevronDown, CreditCard, Globe, Zap, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MiniKit, Tokens, PaymentFinalStatus } from "@worldcoin/minikit-js";
import { motion, AnimatePresence } from "framer-motion";

interface Tier {
  id: string;
  name: string;
  description?: string;
  priceWld: string;
  benefits: string[];
  trialDays: number;
  bundle3moDiscountPct: number;
  bundle6moDiscountPct: number;
  bundle12moDiscountPct: number;
}

interface SubscribePlanProps {
  creatorId: string;
  creatorUsername: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

const BUNDLE_OPTIONS = [
  { months: 1, label: "1 Month" },
  { months: 3, label: "3 Months" },
  { months: 6, label: "6 Months" },
  { months: 12, label: "12 Months" },
];

export function SubscribePlan({ creatorId, creatorUsername, onSuccess, onClose }: SubscribePlanProps) {
  const { user } = useAuthStore();
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [selectedMonths, setSelectedMonths] = useState(1);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [priceCalc, setPriceCalc] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [isStripeLoading, setIsStripeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load tiers
  useEffect(() => {
    fetch(`/api/subscriptions/tiers/${creatorId}`)
      .then(r => r.json())
      .then(data => {
        setTiers(data.tiers || []);
        if (data.tiers?.length > 0) setSelectedTierId(data.tiers[0].id);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, [creatorId]);

  // Recalculate price whenever tier/months/promo changes
  useEffect(() => {
    if (!selectedTierId) return;
    const code = promoApplied ? promoCode : "";
    fetch("/api/subscriptions/calculate-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        tierId: selectedTierId,
        creatorId,
        bundleMonths: selectedMonths,
        promoCode: code || undefined,
      }),
    })
      .then(r => r.json())
      .then(setPriceCalc)
      .catch(console.error);
  }, [selectedTierId, selectedMonths, promoApplied, creatorId]);

  const selectedTier = tiers.find(t => t.id === selectedTierId);

  const bundleDiscountPct = () => {
    if (!selectedTier) return 0;
    if (selectedMonths === 3) return selectedTier.bundle3moDiscountPct;
    if (selectedMonths === 6) return selectedTier.bundle6moDiscountPct;
    if (selectedMonths >= 12) return selectedTier.bundle12moDiscountPct;
    return 0;
  };

  const handleValidatePromo = async () => {
    if (!promoCode.trim()) return;
    setPromoValidating(true);
    setPromoError(null);
    try {
      const r = await fetch("/api/subscriptions/validate-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: promoCode.trim(), tierId: selectedTierId, creatorId }),
      });
      const data = await r.json() as { valid: boolean; error?: string; discountType?: string; discountValue?: string };
      if (data.valid) {
        setPromoApplied(true);
        setPromoError(null);
      } else {
        setPromoError(data.error || "Invalid code");
        setPromoApplied(false);
      }
    } catch {
      setPromoError("Failed to validate code");
    } finally {
      setPromoValidating(false);
    }
  };

  const handleRemovePromo = () => {
    setPromoCode("");
    setPromoApplied(false);
    setPromoError(null);
  };

  // ─── Subscribe with WLD (MiniKit) ─────────────────────────────────────────
  const handleSubscribeWLD = async () => {
    if (!user) return;
    setIsSubscribing(true);
    setError(null);
    try {
      const r = await fetch("/api/subscriptions/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          creatorId,
          tierId: selectedTierId,
          bundleMonths: selectedMonths,
          promoCode: promoApplied ? promoCode.trim() : undefined,
        }),
      });
      const data = await r.json() as any;
      if (!r.ok) throw new Error(data.error || "Failed to initiate payment");

      // Free trial — no payment needed
      if (data.trial) {
        setSuccess(true);
        setTimeout(() => onSuccess?.(), 1500);
        return;
      }

      if (!MiniKit.isInstalled()) {
        // Dev fallback: skip payment, call verify directly
        await verifySubscription(data.referenceId, "dev_tx_" + Date.now(), data);
        return;
      }

      const { finalPayload } = await MiniKit.commandsAsync.pay({
        reference: data.referenceId,
        to: data.to,
        tokens: data.tokens.map((t: any) => ({
          symbol: t.symbol as Tokens,
          token_amount: t.token_amount,
        })),
        description: data.description,
        network: "worldchain",
      });

      if (finalPayload.status !== PaymentFinalStatus.Success) {
        throw new Error("Payment cancelled or failed");
      }

      await verifySubscription(data.referenceId, finalPayload.transaction_id, data);
    } catch (e: any) {
      setError(e.message || "Payment failed. Please try again.");
    } finally {
      setIsSubscribing(false);
    }
  };

  const verifySubscription = async (referenceId: string, transactionId: string, meta: any) => {
    const vr = await fetch("/api/subscriptions/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        referenceId,
        transactionId,
        months: selectedMonths,
        tierId: selectedTierId,
        promoCodeId: meta.promoCodeId,
        discountAppliedPct: meta.discountAppliedPct,
      }),
    });
    const vd = await vr.json() as { success: boolean };
    if (vd.success) {
      setSuccess(true);
      setTimeout(() => onSuccess?.(), 1500);
    } else {
      throw new Error("Payment could not be verified");
    }
  };

  // ─── Subscribe with Card (Stripe) ─────────────────────────────────────────
  const handleSubscribeStripe = async () => {
    setIsStripeLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/payments/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "subscription",
          recipientId: creatorId,
          tierId: selectedTierId,
          bundleMonths: selectedMonths,
        }),
      });
      const data = await r.json() as { checkoutUrl?: string; error?: string };
      if (!r.ok || !data.checkoutUrl) throw new Error(data.error || "Stripe checkout failed");
      window.open(data.checkoutUrl, "_blank");
    } catch (e: any) {
      setError(e.message || "Stripe payment unavailable");
    } finally {
      setIsStripeLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (success) {
    return (
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="flex flex-col items-center justify-center gap-4 p-10 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-xl font-bold">Subscribed!</h3>
        <p className="text-muted-foreground text-sm">
          You now have access to @{creatorUsername}'s exclusive content.
        </p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-5 p-1">
      {/* Tier selector */}
      {tiers.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Choose tier</p>
          <div className="space-y-2">
            {tiers.map((tier, i) => {
              const isSelected = tier.id === selectedTierId;
              const discount = selectedMonths === 3 ? tier.bundle3moDiscountPct
                : selectedMonths === 6 ? tier.bundle6moDiscountPct
                : selectedMonths >= 12 ? tier.bundle12moDiscountPct : 0;
              const finalMonthly = discount > 0
                ? (parseFloat(tier.priceWld) * (1 - discount / 100)).toFixed(2)
                : tier.priceWld;

              return (
                <motion.button
                  key={tier.id}
                  onClick={() => setSelectedTierId(tier.id)}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "w-full p-4 rounded-2xl border text-left transition-all duration-200",
                    isSelected
                      ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                      : "border-white/10 bg-white/5 hover:bg-white/8"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{tier.name}</span>
                        {i === 0 && tiers.length > 1 && (
                          <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30 px-1.5">POPULAR</Badge>
                        )}
                        {tier.trialDays > 0 && (
                          <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30 px-1.5">FREE TRIAL</Badge>
                        )}
                      </div>
                      {tier.description && (
                        <p className="text-xs text-muted-foreground mb-2">{tier.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
                        {tier.benefits.slice(0, 3).map(b => (
                          <span key={b} className="flex items-center gap-1 text-[11px] text-white/60">
                            <Check className="w-3 h-3 text-primary flex-shrink-0" />{b}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {discount > 0 ? (
                        <>
                          <div className="text-xs text-muted-foreground line-through">{tier.priceWld} WLD</div>
                          <div className="font-bold text-primary">{finalMonthly} WLD</div>
                        </>
                      ) : (
                        <div className="font-bold">{tier.priceWld} WLD</div>
                      )}
                      <div className="text-[11px] text-muted-foreground">/month</div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      )}

      {/* Single tier benefits */}
      {tiers.length === 1 && selectedTier && selectedTier.benefits.length > 0 && (
        <div className="bg-white/5 rounded-2xl p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What you get</p>
          {selectedTier.benefits.map(b => (
            <div key={b} className="flex items-center gap-2 text-sm">
              <Check className="w-4 h-4 text-primary flex-shrink-0" />
              <span>{b}</span>
            </div>
          ))}
          {selectedTier.trialDays > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-400">
              <Zap className="w-4 h-4 flex-shrink-0" />
              <span>{selectedTier.trialDays}-day free trial included</span>
            </div>
          )}
        </div>
      )}

      {/* Duration / Bundle selector */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">Duration</p>
        <div className="grid grid-cols-4 gap-2">
          {BUNDLE_OPTIONS.map(({ months, label }) => {
            const discount = selectedTier
              ? months === 3 ? selectedTier.bundle3moDiscountPct
              : months === 6 ? selectedTier.bundle6moDiscountPct
              : months === 12 ? selectedTier.bundle12moDiscountPct
              : 0
              : 0;
            const isSelected = selectedMonths === months;
            return (
              <button
                key={months}
                onClick={() => setSelectedMonths(months)}
                className={cn(
                  "relative flex flex-col items-center py-3 px-1 rounded-xl border text-center transition-all duration-200",
                  isSelected
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/8"
                )}
              >
                {discount > 0 && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                    -{discount}%
                  </span>
                )}
                <span className="font-semibold text-sm">{months}</span>
                <span className="text-[10px]">{months === 1 ? "month" : "mo"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price summary */}
      {priceCalc && (
        <div className="bg-white/5 rounded-2xl p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Base price</span>
            <span>{(parseFloat(priceCalc.basePricePerMonthWld) * selectedMonths).toFixed(4)} WLD</span>
          </div>
          {(priceCalc.bundleDiscountPct > 0 || priceCalc.promoDiscountPct > 0) && (
            <>
              {priceCalc.bundleDiscountPct > 0 && (
                <div className="flex justify-between text-sm text-green-400">
                  <span>Bundle discount (-{priceCalc.bundleDiscountPct}%)</span>
                  <span>-{(parseFloat(priceCalc.baseTotal) - parseFloat(priceCalc.baseTotal) * (1 - priceCalc.bundleDiscountPct / 100)).toFixed(4)} WLD</span>
                </div>
              )}
              {priceCalc.promoDiscountPct > 0 && (
                <div className="flex justify-between text-sm text-green-400">
                  <span>Promo code (-{priceCalc.promoDiscountPct}%)</span>
                  <span>-{priceCalc.promoDiscountWld} WLD</span>
                </div>
              )}
              <div className="border-t border-white/10 pt-2" />
            </>
          )}
          <div className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-primary text-lg">{parseFloat(priceCalc.finalPriceWld).toFixed(4)} WLD</span>
          </div>
          {priceCalc.trialDays > 0 && parseFloat(priceCalc.finalPriceWld) === 0 && (
            <p className="text-green-400 text-xs text-center">🎉 {priceCalc.trialDays}-day free trial — no charge today!</p>
          )}
          {priceCalc.totalDiscountPct > 0 && (
            <p className="text-green-400 text-xs text-center">You save {priceCalc.savings} WLD ({priceCalc.totalDiscountPct}% off)</p>
          )}
        </div>
      )}

      {/* Promo code */}
      <div>
        <button
          onClick={() => setShowPromoInput(v => !v)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Tag className="w-4 h-4" />
          {promoApplied ? (
            <span className="text-green-400 font-medium">"{promoCode}" applied</span>
          ) : (
            <span>Have a promo code?</span>
          )}
          <ChevronDown className={cn("w-3 h-3 transition-transform", showPromoInput && "rotate-180")} />
        </button>

        <AnimatePresence>
          {showPromoInput && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex gap-2">
                <Input
                  placeholder="HFANS20"
                  value={promoCode}
                  onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoApplied(false); setPromoError(null); }}
                  className="bg-white/8 border-white/15 rounded-xl uppercase font-mono tracking-wider"
                  disabled={promoApplied}
                />
                {promoApplied ? (
                  <Button variant="outline" size="sm" onClick={handleRemovePromo} className="shrink-0 rounded-xl border-white/15">
                    Remove
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleValidatePromo}
                    disabled={!promoCode.trim() || promoValidating}
                    className="shrink-0 rounded-xl"
                  >
                    {promoValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : "Apply"}
                  </Button>
                )}
              </div>
              {promoError && (
                <p className="text-red-400 text-xs mt-1.5 px-1">{promoError}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* CTA Buttons */}
      <div className="space-y-3 pt-1">
        <Button
          className="w-full h-14 rounded-2xl text-base font-semibold gap-3 shadow-lg shadow-primary/20 hover:scale-[1.01] transition-transform"
          onClick={handleSubscribeWLD}
          disabled={isSubscribing || isStripeLoading || !selectedTierId}
        >
          {isSubscribing ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Globe className="w-5 h-5" />
          )}
          {isSubscribing ? "Subscribing..." : (
            priceCalc?.trialDays > 0 && parseFloat(priceCalc?.finalPriceWld || "1") === 0
              ? "Start Free Trial"
              : `Subscribe with WLD — ${priceCalc ? parseFloat(priceCalc.finalPriceWld).toFixed(4) : "..."} WLD`
          )}
        </Button>

        <Button
          variant="outline"
          className="w-full h-12 rounded-2xl gap-2 border-white/15 hover:bg-white/8"
          onClick={handleSubscribeStripe}
          disabled={isSubscribing || isStripeLoading || !selectedTierId}
        >
          {isStripeLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CreditCard className="w-4 h-4" />
          )}
          Pay with Card
          <Lock className="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Cancel anytime · Secure payment · 18+ only
      </p>
    </div>
  );
}
