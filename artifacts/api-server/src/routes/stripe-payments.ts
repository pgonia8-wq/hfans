import { Router } from "express";
import Stripe from "stripe";
import {
  db, paymentsTable, subscriptionsTable, subscriptionTiersTable,
  creatorProfilesTable, usersTable, ppvUnlocksTable, notificationsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_FEE_RATE = 0.20;
const WLD_USD_RATE = parseFloat(process.env.WLD_USD_RATE || "1.5"); // 1 WLD = $X USD

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2025-01-27.acacia" });
}

function calcSplit(amountWld: string) {
  const amt = parseFloat(amountWld);
  const fee = amt * PLATFORM_FEE_RATE;
  return {
    platformFeeWld: fee.toFixed(6),
    creatorAmountWld: (amt - fee).toFixed(6),
  };
}

// ─── POST /payments/stripe/checkout ──────────────────────────────────────────
// Create a Stripe Checkout Session for WLD-equivalent payment in USD
router.post("/checkout", requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Stripe not configured. Set STRIPE_SECRET_KEY." });
    }

    const user = getUser(req)!;
    const { type, recipientId, tierId, bundleMonths = 1, promoCode, contentId, amountWld } = req.body;

    if (!recipientId) return res.status(400).json({ error: "recipientId required" });

    const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, recipientId)).limit(1);
    if (!recipient) return res.status(404).json({ error: "Recipient not found" });

    let finalAmountWld = amountWld;
    let description = "";
    const months = Math.max(1, parseInt(bundleMonths));

    if (type === "subscription") {
      if (tierId && tierId !== "default") {
        const [tier] = await db.select().from(subscriptionTiersTable)
          .where(eq(subscriptionTiersTable.id, tierId)).limit(1);
        finalAmountWld = tier ? (parseFloat(tier.priceWld) * months).toFixed(6) : "5.0";
      } else {
        const [cp] = await db.select().from(creatorProfilesTable)
          .where(eq(creatorProfilesTable.userId, recipientId)).limit(1);
        finalAmountWld = ((parseFloat(cp?.subscriptionPriceWld || "1.0")) * months).toFixed(6);
      }
      description = months > 1
        ? `${months}-month subscription to @${recipient.username}`
        : `Subscription to @${recipient.username}`;
    } else if (type === "ppv") {
      description = `Content unlock from @${recipient.username}`;
    } else if (type === "tip") {
      description = `Tip to @${recipient.username}`;
    }

    if (!finalAmountWld || parseFloat(finalAmountWld) <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const { platformFeeWld, creatorAmountWld } = calcSplit(finalAmountWld);

    // Convert WLD to USD cents
    const amountUsd = parseFloat(finalAmountWld) * WLD_USD_RATE;
    const amountCents = Math.round(amountUsd * 100);
    if (amountCents < 50) return res.status(400).json({ error: "Amount too small (minimum $0.50)" });

    const referenceId = crypto.randomUUID();

    // Store pending payment
    await db.insert(paymentsTable).values({
      referenceId,
      payerId: user.id,
      recipientId,
      type: type as any,
      currency: "USD",
      amountWld: finalAmountWld,
      amountUsd: amountUsd.toFixed(2),
      platformFeeWld,
      creatorAmountWld,
      status: "pending",
      description,
      contentId,
    });

    const origin = process.env.FRONTEND_URL || `https://${process.env.REPLIT_DEV_DOMAIN}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: description,
            description: `H Fans — ${description}`,
          },
          unit_amount: amountCents,
        },
        quantity: 1,
      }],
      metadata: {
        referenceId,
        type,
        payerId: user.id,
        recipientId,
        tierId: tierId || "",
        bundleMonths: String(months),
        contentId: contentId || "",
      },
      success_url: `${origin}/?stripe_success=1&ref=${referenceId}`,
      cancel_url: `${origin}/?stripe_cancel=1`,
    });

    // Store session ID
    await db.update(paymentsTable)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(paymentsTable.referenceId, referenceId));

    res.json({
      checkoutUrl: session.url,
      referenceId,
      sessionId: session.id,
    });
  } catch (err) {
    req.log.error({ err }, "Stripe checkout error");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ─── GET /payments/stripe/session/:sessionId ──────────────────────────────────
// Check status of a Stripe Checkout Session (called after redirect)
router.get("/session/:sessionId", requireAuth, async (req, res) => {
  try {
    const stripe = getStripe();
    if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);

    if (session.payment_status === "paid") {
      // Find and activate the payment
      const referenceId = session.metadata?.referenceId;
      if (referenceId) {
        const [payment] = await db.select().from(paymentsTable)
          .where(eq(paymentsTable.referenceId, referenceId)).limit(1);

        if (payment && payment.status === "pending") {
          await db.update(paymentsTable).set({
            status: "completed",
            stripePaymentIntentId: session.payment_intent as string,
            verifiedAt: new Date(),
            updatedAt: new Date(),
          }).where(eq(paymentsTable.id, payment.id));

          await creditCreatorBalance(payment.recipientId!, payment.creatorAmountWld);

          if (payment.type === "subscription") {
            const months = parseInt(session.metadata?.bundleMonths || "1");
            await activateSubscription({
              fanId: payment.payerId!,
              creatorId: payment.recipientId!,
              tierId: session.metadata?.tierId || undefined,
              priceWld: payment.amountWld,
              months,
            });
          } else if (payment.type === "ppv" && payment.contentId) {
            await db.insert(ppvUnlocksTable).values({
              userId: payment.payerId!,
              contentId: payment.contentId,
              contentType: "post",
              paymentId: payment.id,
            });
          }
        }
      }
    }

    res.json({ status: session.payment_status, paymentStatus: session.payment_status });
  } catch (err) {
    req.log.error({ err }, "Stripe session check error");
    res.status(500).json({ error: "Failed to check session" });
  }
});

// ─── POST /stripe/webhook ────────────────────────────────────────────────────
// Stripe webhook handler (mount at raw body route)
router.post("/webhook", async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(503).json({ error: "Stripe not configured" });

  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret || "");
  } catch (err: any) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.CheckoutSession;
    const referenceId = session.metadata?.referenceId;
    if (!referenceId) return res.json({ received: true });

    const [payment] = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.referenceId, referenceId)).limit(1);

    if (payment && payment.status === "pending") {
      await db.update(paymentsTable).set({
        status: "completed",
        stripePaymentIntentId: session.payment_intent as string,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(paymentsTable.id, payment.id));

      await creditCreatorBalance(payment.recipientId!, payment.creatorAmountWld);

      if (payment.type === "subscription") {
        const months = parseInt(session.metadata?.bundleMonths || "1");
        await activateSubscription({
          fanId: payment.payerId!,
          creatorId: payment.recipientId!,
          tierId: session.metadata?.tierId || undefined,
          priceWld: payment.amountWld,
          months,
        });

        const [fan] = await db.select().from(usersTable).where(eq(usersTable.id, payment.payerId!)).limit(1);
        await db.insert(notificationsTable).values({
          userId: payment.recipientId!,
          type: "new_subscriber",
          title: "New Subscriber (Card)!",
          body: `@${fan?.username} subscribed${months > 1 ? ` for ${months} months` : ""} via card`,
          metadata: { fanId: payment.payerId!, amountWld: payment.amountWld },
        });
      } else if (payment.type === "ppv" && payment.contentId) {
        await db.insert(ppvUnlocksTable).values({
          userId: payment.payerId!,
          contentId: payment.contentId,
          contentType: "post",
          paymentId: payment.id,
        });
      }
    }
  }

  res.json({ received: true });
});

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

async function activateSubscription(opts: {
  fanId: string; creatorId: string; tierId?: string;
  priceWld: string; months: number;
}) {
  const { fanId, creatorId, tierId, priceWld, months } = opts;
  const expiresAt = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
  const [existing] = await db.select().from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.fanId, fanId), eq(subscriptionsTable.creatorId, creatorId)))
    .limit(1);

  if (existing && existing.status !== "cancelled") {
    await db.update(subscriptionsTable).set({
      tierId, priceWld, status: "active", expiresAt, updatedAt: new Date(),
    }).where(eq(subscriptionsTable.id, existing.id));
  } else {
    await db.insert(subscriptionsTable).values({
      fanId, creatorId, tierId, priceWld, bundleMonths: months,
      status: "active", autoRenew: false, startedAt: new Date(), expiresAt,
    });
  }
}

export default router;
