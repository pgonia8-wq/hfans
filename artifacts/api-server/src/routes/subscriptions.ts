import { Router } from "express";
import {
  db, subscriptionsTable, paymentsTable, creatorProfilesTable, usersTable
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";
const PLATFORM_FEE_RATE = 0.20;

// Get my subscriptions
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
        fanId: sub.fanId,
        creatorId: sub.creatorId,
        creator: {
          id: creator.id,
          username: creator.username,
          displayName: creator.displayName,
          avatarUrl: creator.avatarUrl,
        },
        priceWld: sub.priceWld,
        status: sub.status,
        startedAt: sub.startedAt,
        expiresAt: sub.expiresAt,
        autoRenew: sub.autoRenew,
      })),
      total: subs.length,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting subscriptions");
    res.status(500).json({ error: "Failed to get subscriptions" });
  }
});

// Subscribe to creator - returns MiniKit payment data
router.post("/subscribe", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { creatorId, months = 1 } = req.body;

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, creatorId)).limit(1);
    if (!creator) {
      res.status(404).json({ error: "Creator not found" });
      return;
    }

    const [creatorProfile] = await db.select().from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, creatorId)).limit(1);

    const priceWld = creatorProfile?.subscriptionPriceWld || "1.0";
    const totalWld = (parseFloat(priceWld) * months).toFixed(6);

    const platformFee = parseFloat(totalWld) * PLATFORM_FEE_RATE;
    const creatorAmount = parseFloat(totalWld) - platformFee;

    const referenceId = crypto.randomUUID();
    const description = `${months > 1 ? months + " months " : ""}Subscription to @${creator.username}`;

    // Store pending payment
    await db.insert(paymentsTable).values({
      referenceId,
      payerId: user.id,
      recipientId: creatorId,
      type: "subscription",
      amountWld: totalWld,
      platformFeeWld: platformFee.toFixed(6),
      creatorAmountWld: creatorAmount.toFixed(6),
      status: "pending",
      description,
    });

    res.json({
      referenceId,
      to: PLATFORM_WALLET,
      amountWld: totalWld,
      description,
      tokens: [
        { symbol: "WLD", token_amount: String(Math.round(parseFloat(totalWld) * 1e18)) }
      ],
    });
  } catch (err) {
    req.log.error({ err }, "Error initiating subscription");
    res.status(500).json({ error: "Failed to initiate subscription" });
  }
});

// Cancel subscription
router.post("/:subscriptionId/cancel", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { subscriptionId } = req.params;

    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.id, subscriptionId), eq(subscriptionsTable.fanId, user.id)))
      .limit(1);

    if (!sub) {
      res.status(404).json({ error: "Subscription not found" });
      return;
    }

    await db.update(subscriptionsTable)
      .set({ status: "cancelled", autoRenew: false, updatedAt: new Date() })
      .where(eq(subscriptionsTable.id, subscriptionId));

    res.json({ success: true, message: "Subscription cancelled" });
  } catch (err) {
    req.log.error({ err }, "Error cancelling subscription");
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

// Check subscription status
router.get("/check/:creatorId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { creatorId } = req.params;

    const [sub] = await db.select().from(subscriptionsTable)
      .where(and(
        eq(subscriptionsTable.fanId, user.id),
        eq(subscriptionsTable.creatorId, creatorId),
        eq(subscriptionsTable.status, "active")
      ))
      .limit(1);

    res.json({
      isSubscribed: !!sub,
      subscription: sub ? {
        id: sub.id,
        status: sub.status,
        expiresAt: sub.expiresAt,
        priceWld: sub.priceWld,
        autoRenew: sub.autoRenew,
      } : null,
    });
  } catch (err) {
    req.log.error({ err }, "Error checking subscription");
    res.status(500).json({ error: "Failed to check subscription" });
  }
});

export default router;
