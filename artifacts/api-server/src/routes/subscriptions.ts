import { Router } from "express";
import {
  db, subscriptionsTable, subscriptionTiersTable, promoCodesTable,
  paymentsTable, creatorProfilesTable, usersTable, notificationsTable,
} from "@workspace/db";
import { eq, and, desc, lt } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";
const PLATFORM_FEE_RATE = 0.20;

function calcSplit(amountWld: string) {
  const amt = parseFloat(amountWld);
  const fee = amt * PLATFORM_FEE_RATE;
  return {
    platformFeeWld: fee.toFixed(6),
    creatorAmountWld: (amt - fee).toFixed(6),
  };
}

// ─── GET /subscriptions/tiers/:creatorId ─────────────────────────────────────
// Public: list active subscription tiers for a creator
router.get("/tiers/:creatorId", async (req, res) => {
  try {
    const { creatorId } = req.params;
    const tiers = await db
      .select()
      .from(subscriptionTiersTable)
      .where(and(
        eq(subscriptionTiersTable.creatorId, creatorId),
        eq(subscriptionTiersTable.isActive, true),
      ))
      .orderBy(subscriptionTiersTable.sortOrder);

    // If no tiers configured, return the creator's default pricing as a single tier
    if (tiers.length === 0) {
      const [cp] = await db.select().from(creatorProfilesTable)
        .where(eq(creatorProfilesTable.userId, creatorId)).limit(1);
      if (cp) {
        return res.json({
          tiers: [{
            id: "default",
            creatorId,
            name: "Fan",
            description: "Access to all subscriber content",
            priceWld: cp.subscriptionPriceWld,
            benefits: [
              "Full access to subscriber posts",
              "Private feed",
              "Direct messages",
            ],
            trialDays: cp.freeTrialDays || 0,
            bundle3moDiscountPct: 10,
            bundle6moDiscountPct: 15,
            bundle12moDiscountPct: 20,
            sortOrder: 0,
            isActive: true,
          }],
        });
      }
    }

    res.json({ tiers });
  } catch (err) {
    req.log.error({ err }, "Error getting tiers");
    res.status(500).json({ error: "Failed to get subscription tiers" });
  }
});

// ─── POST /subscriptions/calculate-price ─────────────────────────────────────
// Calculate final price given tier + bundle months + promo code
router.post("/calculate-price", requireAuth, async (req, res) => {
  try {
    const { tierId, creatorId, bundleMonths = 1, promoCode } = req.body;

    let basePriceWld: string;
    let trialDays = 0;
    let bundle3 = 0, bundle6 = 0, bundle12 = 0;

    if (tierId && tierId !== "default") {
      const [tier] = await db.select().from(subscriptionTiersTable)
        .where(eq(subscriptionTiersTable.id, tierId)).limit(1);
      if (!tier) return res.status(404).json({ error: "Tier not found" });
      basePriceWld = tier.priceWld;
      trialDays = tier.trialDays;
      bundle3 = tier.bundle3moDiscountPct;
      bundle6 = tier.bundle6moDiscountPct;
      bundle12 = tier.bundle12moDiscountPct;
    } else {
      const [cp] = await db.select().from(creatorProfilesTable)
        .where(eq(creatorProfilesTable.userId, creatorId)).limit(1);
      basePriceWld = cp?.subscriptionPriceWld || "1.0";
      trialDays = cp?.freeTrialDays || 0;
      bundle3 = 10; bundle6 = 15; bundle12 = 20;
    }

    const months = Math.max(1, Math.min(12, parseInt(bundleMonths)));
    let bundleDiscountPct = 0;
    if (months === 3) bundleDiscountPct = bundle3;
    else if (months === 6) bundleDiscountPct = bundle6;
    else if (months >= 12) bundleDiscountPct = bundle12;

    const baseTotal = parseFloat(basePriceWld) * months;

    // Apply bundle discount
    const afterBundleDiscount = baseTotal * (1 - bundleDiscountPct / 100);

    // Apply promo code
    let promoDiscountPct = 0;
    let promoDiscountWld = 0;
    let promoCodeRecord = null;

    if (promoCode) {
      const [promo] = await db.select().from(promoCodesTable)
        .where(eq(promoCodesTable.code, promoCode.toUpperCase())).limit(1);

      if (!promo) return res.status(400).json({ error: "Invalid promo code" });
      if (promo.expiresAt && promo.expiresAt < new Date()) return res.status(400).json({ error: "Promo code expired" });
      if (promo.maxUses && promo.usesCount >= promo.maxUses) return res.status(400).json({ error: "Promo code fully used" });
      if (promo.tierId && promo.tierId !== tierId) return res.status(400).json({ error: "Promo code not valid for this tier" });

      promoCodeRecord = promo;
      if (promo.discountType === "percent") {
        promoDiscountPct = parseFloat(promo.discountValue);
      } else {
        promoDiscountWld = parseFloat(promo.discountValue);
      }
    }

    const afterPromo = promoDiscountPct > 0
      ? afterBundleDiscount * (1 - promoDiscountPct / 100)
      : Math.max(0, afterBundleDiscount - promoDiscountWld);

    const finalPriceWld = Math.max(0, afterPromo).toFixed(6);
    const totalDiscountPct = Math.round(((baseTotal - parseFloat(finalPriceWld)) / baseTotal) * 100);

    res.json({
      basePricePerMonthWld: basePriceWld,
      months,
      baseTotal: baseTotal.toFixed(6),
      bundleDiscountPct,
      promoDiscountPct,
      promoDiscountWld: promoDiscountWld.toFixed(6),
      finalPriceWld,
      totalDiscountPct,
      trialDays,
      savings: (baseTotal - parseFloat(finalPriceWld)).toFixed(6),
    });
  } catch (err) {
    req.log.error({ err }, "Error calculating price");
    res.status(500).json({ error: "Failed to calculate price" });
  }
});

// ─── POST /subscriptions/subscribe ───────────────────────────────────────────
// Initiate subscription payment — returns MiniKit pay payload
router.post("/subscribe", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { creatorId, tierId, bundleMonths = 1, promoCode } = req.body;

    if (!creatorId) return res.status(400).json({ error: "creatorId required" });

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, creatorId)).limit(1);
    if (!creator) return res.status(404).json({ error: "Creator not found" });

    // Prevent self-subscribe
    if (user.id === creatorId) return res.status(400).json({ error: "Cannot subscribe to yourself" });

    // Calculate price
    const calcRes = await fetch(`http://localhost:${process.env.PORT}/api/subscriptions/calculate-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: req.headers.cookie || "" },
      body: JSON.stringify({ tierId, creatorId, bundleMonths, promoCode }),
    });
    const calc = await calcRes.json() as any;
    if (!calcRes.ok) return res.status(400).json(calc);

    const { finalPriceWld, trialDays, totalDiscountPct } = calc;
    const months = parseInt(bundleMonths);

    // Handle promo code lookup
    let promoCodeId: string | undefined;
    if (promoCode) {
      const [promo] = await db.select().from(promoCodesTable)
        .where(eq(promoCodesTable.code, promoCode.toUpperCase())).limit(1);
      if (promo) promoCodeId = promo.id;
    }

    const referenceId = crypto.randomUUID();
    const { platformFeeWld, creatorAmountWld } = calcSplit(finalPriceWld);
    const description = months > 1
      ? `${months}-month subscription to @${creator.username}`
      : `Subscription to @${creator.username}`;

    await db.insert(paymentsTable).values({
      referenceId,
      payerId: user.id,
      recipientId: creatorId,
      type: "subscription",
      currency: "WLD",
      amountWld: finalPriceWld,
      platformFeeWld,
      creatorAmountWld,
      status: "pending",
      description,
    });

    // If free trial, no payment needed — activate immediately
    if (trialDays > 0 && parseFloat(finalPriceWld) === 0) {
      const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
      await activateSubscription({
        fanId: user.id, creatorId, tierId, priceWld: "0",
        bundleMonths: months, promoCodeId, discountAppliedPct: totalDiscountPct,
        trialEndsAt, months,
      });
      if (promoCodeId) await incrementPromoUsage(promoCodeId);
      return res.json({ success: true, trial: true, trialEndsAt });
    }

    const token_amount = String(Math.round(parseFloat(finalPriceWld) * 1e18));

    res.json({
      referenceId,
      to: PLATFORM_WALLET,
      amountWld: finalPriceWld,
      description,
      tokens: [{ symbol: "WLD", token_amount }],
      // Metadata for frontend
      months,
      tierId,
      promoCodeId,
      discountAppliedPct: totalDiscountPct,
    });
  } catch (err) {
    req.log.error({ err }, "Error initiating subscription");
    res.status(500).json({ error: "Failed to initiate subscription" });
  }
});

// ─── POST /subscriptions/verify ──────────────────────────────────────────────
// After MiniKit payment confirmation, activate the subscription
router.post("/verify", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { referenceId, transactionId, payload, months = 1, tierId, promoCodeId, discountAppliedPct = 0 } = req.body;

    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.referenceId, referenceId), eq(paymentsTable.payerId, user.id)))
      .limit(1);

    if (!payment) return res.status(404).json({ error: "Payment not found" });
    if (payment.status === "completed") return res.json({ success: true, already: true });

    // Verify via Developer Portal
    let verified = await verifyViaPortal(transactionId || referenceId, referenceId);
    if (!verified && payload?.status === "success") verified = true; // MiniKit fallback

    if (!verified) {
      await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() })
        .where(eq(paymentsTable.id, payment.id));
      return res.json({ success: false });
    }

    // Mark payment completed
    await db.update(paymentsTable).set({
      status: "completed", transactionId, verifiedAt: new Date(), updatedAt: new Date(),
    }).where(eq(paymentsTable.id, payment.id));

    // Credit creator balance
    await creditCreatorBalance(payment.recipientId!, payment.creatorAmountWld);

    // Activate subscription
    await activateSubscription({
      fanId: user.id,
      creatorId: payment.recipientId!,
      tierId,
      priceWld: payment.amountWld,
      bundleMonths: months,
      promoCodeId,
      discountAppliedPct,
      months,
    });

    if (promoCodeId) await incrementPromoUsage(promoCodeId);

    // Notify creator
    const [fan] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
    await db.insert(notificationsTable).values({
      userId: payment.recipientId!,
      type: "new_subscriber",
      title: "New Subscriber!",
      body: `@${fan?.username} just subscribed${months > 1 ? ` for ${months} months` : ""}`,
      metadata: { fanId: user.id, amountWld: payment.amountWld },
    });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Subscription verify error");
    res.status(500).json({ error: "Failed to verify subscription" });
  }
});

// ─── GET /subscriptions ───────────────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const subs = await db
      .select({ sub: subscriptionsTable, creator: usersTable })
      .from(subscriptionsTable)
      .innerJoin(usersTable, eq(subscriptionsTable.creatorId, usersTable.id))
      .where(eq(subscriptionsTable.fanId, user.id))
      .orderBy(desc(subscriptionsTable.createdAt));

    res.json({
      subscriptions: subs.map(({ sub, creator }) => ({
        id: sub.id,
        creatorId: sub.creatorId,
        tierId: sub.tierId,
        creator: { id: creator.id, username: creator.username, displayName: creator.displayName, avatarUrl: creator.avatarUrl },
        priceWld: sub.priceWld,
        bundleMonths: sub.bundleMonths,
        discountAppliedPct: sub.discountAppliedPct,
        status: sub.status,
        startedAt: sub.startedAt,
        expiresAt: sub.expiresAt,
        trialEndsAt: sub.trialEndsAt,
        autoRenew: sub.autoRenew,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get subscriptions" });
  }
});

// ─── GET /subscriptions/check/:creatorId ─────────────────────────────────────
router.get("/check/:creatorId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(
        eq(subscriptionsTable.fanId, user.id),
        eq(subscriptionsTable.creatorId, req.params.creatorId),
      ))
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    const isActive = sub && (sub.status === "active" || sub.status === "trial") && (!sub.expiresAt || sub.expiresAt > new Date());
    res.json({ isSubscribed: isActive, subscription: sub || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to check subscription" });
  }
});

// ─── POST /subscriptions/:id/cancel ──────────────────────────────────────────
router.post("/:id/cancel", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.id, req.params.id), eq(subscriptionsTable.fanId, user.id)))
      .limit(1);
    if (!sub) return res.status(404).json({ error: "Not found" });
    await db.update(subscriptionsTable)
      .set({ status: "cancelled", autoRenew: false, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, sub.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel" });
  }
});

// ─── POST /subscriptions/:id/toggle-renew ────────────────────────────────────
router.post("/:id/toggle-renew", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.id, req.params.id), eq(subscriptionsTable.fanId, user.id)))
      .limit(1);
    if (!sub) return res.status(404).json({ error: "Not found" });
    await db.update(subscriptionsTable)
      .set({ autoRenew: !sub.autoRenew, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, sub.id));
    res.json({ success: true, autoRenew: !sub.autoRenew });
  } catch (err) {
    res.status(500).json({ error: "Failed" });
  }
});

// ─── POST /subscriptions/validate-promo ──────────────────────────────────────
router.post("/validate-promo", requireAuth, async (req, res) => {
  try {
    const { code, tierId, creatorId } = req.body;
    const [promo] = await db.select().from(promoCodesTable)
      .where(eq(promoCodesTable.code, code.toUpperCase())).limit(1);

    if (!promo) return res.status(400).json({ valid: false, error: "Invalid code" });
    if (promo.expiresAt && promo.expiresAt < new Date()) return res.status(400).json({ valid: false, error: "Code expired" });
    if (promo.maxUses && promo.usesCount >= promo.maxUses) return res.status(400).json({ valid: false, error: "Code fully used" });
    if (promo.creatorId && promo.creatorId !== creatorId) return res.status(400).json({ valid: false, error: "Not valid for this creator" });
    if (promo.tierId && promo.tierId !== tierId) return res.status(400).json({ valid: false, error: "Not valid for this tier" });

    res.json({
      valid: true,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
      usesRemaining: promo.maxUses ? promo.maxUses - promo.usesCount : null,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to validate promo" });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function activateSubscription(opts: {
  fanId: string; creatorId: string; tierId?: string; priceWld: string;
  bundleMonths: number; promoCodeId?: string; discountAppliedPct: number;
  trialEndsAt?: Date; months: number;
}) {
  const { fanId, creatorId, tierId, priceWld, bundleMonths, promoCodeId, discountAppliedPct, trialEndsAt, months } = opts;
  const startedAt = new Date();
  const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
  const status = trialEndsAt ? "trial" : "active";

  const [existing] = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.fanId, fanId), eq(subscriptionsTable.creatorId, creatorId)))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (existing && existing.status !== "cancelled") {
    await db.update(subscriptionsTable).set({
      tierId, priceWld, bundleMonths, promoCodeId, discountAppliedPct,
      status, trialEndsAt, expiresAt, updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, existing.id));
  } else {
    await db.insert(subscriptionsTable).values({
      fanId, creatorId, tierId, priceWld, bundleMonths,
      promoCodeId, discountAppliedPct, status, autoRenew: true,
      trialEndsAt, startedAt, expiresAt,
    });
  }
}

async function creditCreatorBalance(creatorId: string, amountWld: string) {
  const [cp] = await db.select().from(creatorProfilesTable)
    .where(eq(creatorProfilesTable.userId, creatorId)).limit(1);
  if (!cp) return;
  await db.update(creatorProfilesTable).set({
    pendingBalanceWld: (parseFloat(cp.pendingBalanceWld) + parseFloat(amountWld)).toFixed(6),
    totalEarningsWld: (parseFloat(cp.totalEarningsWld) + parseFloat(amountWld)).toFixed(6),
    updatedAt: new Date(),
  }).where(eq(creatorProfilesTable.id, cp.id));
}

async function incrementPromoUsage(promoCodeId: string) {
  const [promo] = await db.select().from(promoCodesTable).where(eq(promoCodesTable.id, promoCodeId)).limit(1);
  if (promo) {
    await db.update(promoCodesTable).set({ usesCount: promo.usesCount + 1 })
      .where(eq(promoCodesTable.id, promoCodeId));
  }
}

async function verifyViaPortal(txId: string, refId: string): Promise<boolean> {
  const appId = process.env.WORLD_APP_ID;
  const apiKey = process.env.WORLD_API_KEY;
  if (!appId || !apiKey) return false;
  try {
    const r = await fetch(
      `https://developer.worldcoin.org/api/v2/minikit/transaction/${txId}?app_id=${appId}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!r.ok) return false;
    const d = await r.json() as { reference?: string; status?: string };
    return d.reference === refId && d.status === "mined";
  } catch {
    return false;
  }
}

export default router;
