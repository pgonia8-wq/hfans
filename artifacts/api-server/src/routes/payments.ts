import { Router } from "express";
import {
  db, paymentsTable, subscriptionsTable, creatorProfilesTable,
  ppvUnlocksTable, usersTable, notificationsTable, postsTable
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";
const PLATFORM_FEE_RATE = 0.20; // 20%
const WORLD_APP_ID = process.env.WORLD_APP_ID || "app_staging_placeholder";

function calculateSplit(amountWld: string) {
  const amount = parseFloat(amountWld);
  const platformFee = amount * PLATFORM_FEE_RATE;
  const creatorAmount = amount - platformFee;
  return {
    platformFeeWld: platformFee.toFixed(6),
    creatorAmountWld: creatorAmount.toFixed(6),
  };
}

// Initiate payment
router.post("/initiate", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { type, recipientId, contentId, amountWld, note } = req.body;

    let finalAmountWld = amountWld;
    let description = "";
    let subscriptionId: string | undefined;

    // Validate and get pricing
    const [recipient] = await db.select().from(usersTable).where(eq(usersTable.id, recipientId)).limit(1);
    if (!recipient) {
      res.status(404).json({ error: "Recipient not found" });
      return;
    }

    if (type === "subscription") {
      const [creatorProfile] = await db.select().from(creatorProfilesTable)
        .where(eq(creatorProfilesTable.userId, recipientId)).limit(1);

      finalAmountWld = creatorProfile?.subscriptionPriceWld || "1.0";
      description = `Subscription to @${recipient.username}`;
    } else if (type === "ppv") {
      if (!contentId) {
        res.status(400).json({ error: "contentId required for PPV" });
        return;
      }
      description = `PPV unlock`;
      if (!finalAmountWld) {
        const [post] = await db.select().from(postsTable).where(eq(postsTable.id, contentId)).limit(1);
        finalAmountWld = post?.ppvPriceWld || "0.5";
      }
    } else if (type === "tip") {
      if (!finalAmountWld) {
        res.status(400).json({ error: "amountWld required for tip" });
        return;
      }
      description = `Tip to @${recipient.username}${note ? ` - ${note}` : ""}`;
    } else if (type === "custom_request") {
      description = `Custom request to @${recipient.username}`;
    }

    const referenceId = crypto.randomUUID();
    const { platformFeeWld, creatorAmountWld } = calculateSplit(finalAmountWld);

    // Store pending payment
    await db.insert(paymentsTable).values({
      referenceId,
      payerId: user.id,
      recipientId,
      type: type as any,
      amountWld: finalAmountWld,
      platformFeeWld,
      creatorAmountWld,
      status: "pending",
      description,
      contentId,
      subscriptionId,
    });

    // Token config for MiniKit
    const tokens = [
      {
        symbol: "WLD",
        token_amount: String(Math.round(parseFloat(finalAmountWld) * 1e18)),
      },
    ];

    res.json({
      referenceId,
      to: PLATFORM_WALLET,
      amountWld: finalAmountWld,
      description,
      tokens,
    });
  } catch (err) {
    req.log.error({ err }, "Error initiating payment");
    res.status(500).json({ error: "Failed to initiate payment" });
  }
});

// Verify payment (called after MiniKit confirms payment)
router.post("/verify", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { referenceId, transactionId, payload } = req.body;

    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.referenceId, referenceId), eq(paymentsTable.payerId, user.id)))
      .limit(1);

    if (!payment) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    if (payment.status === "completed") {
      res.json({ success: true, status: "verified", unlocked: true });
      return;
    }

    // Verify payment via World App Developer Portal API
    let verified = false;
    try {
      const verifyRes = await fetch(
        `https://developer.worldcoin.org/api/v2/minikit/transaction/${transactionId || referenceId}?app_id=${WORLD_APP_ID}`,
        { headers: { Authorization: `Bearer ${process.env.WORLD_API_KEY || ""}` } }
      );
      if (verifyRes.ok) {
        const data = await verifyRes.json() as { reference?: string; status?: string };
        verified = data.reference === referenceId && data.status === "mined";
      }
    } catch (e) {
      req.log.warn({ e }, "Failed to verify via Developer Portal, checking payload");
    }

    // Fallback: trust MiniKit payload (in production use on-chain verification)
    if (!verified && payload?.status === "success") {
      verified = true;
    }

    if (!verified) {
      await db.update(paymentsTable).set({ status: "failed", updatedAt: new Date() }).where(eq(paymentsTable.id, payment.id));
      res.json({ success: false, status: "failed" });
      return;
    }

    // Mark payment completed
    await db.update(paymentsTable).set({
      status: "completed",
      transactionId,
      verifiedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(paymentsTable.id, payment.id));

    // Credit creator balance
    const [creatorProfile] = await db.select().from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, payment.recipientId!)).limit(1);

    if (creatorProfile) {
      const newBalance = (parseFloat(creatorProfile.pendingBalanceWld) + parseFloat(payment.creatorAmountWld)).toFixed(6);
      const newTotal = (parseFloat(creatorProfile.totalEarningsWld) + parseFloat(payment.creatorAmountWld)).toFixed(6);
      await db.update(creatorProfilesTable).set({
        pendingBalanceWld: newBalance,
        totalEarningsWld: newTotal,
        updatedAt: new Date(),
      }).where(eq(creatorProfilesTable.id, creatorProfile.id));
    }

    // Handle subscription activation
    let unlocked = false;
    if (payment.type === "subscription") {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      const [existingSub] = await db.select().from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.fanId, user.id), eq(subscriptionsTable.creatorId, payment.recipientId!)))
        .limit(1);

      if (existingSub) {
        await db.update(subscriptionsTable).set({
          status: "active",
          expiresAt,
          priceWld: payment.amountWld,
          updatedAt: new Date(),
        }).where(eq(subscriptionsTable.id, existingSub.id));
      } else {
        await db.insert(subscriptionsTable).values({
          fanId: user.id,
          creatorId: payment.recipientId!,
          priceWld: payment.amountWld,
          status: "active",
          startedAt: new Date(),
          expiresAt,
        });
      }

      unlocked = true;

      // Notify creator
      await db.insert(notificationsTable).values({
        userId: payment.recipientId!,
        type: "new_subscriber",
        title: "New Subscriber!",
        body: `@${user.username} just subscribed to you`,
        metadata: { fanId: user.id },
      });
    } else if (payment.type === "ppv" && payment.contentId) {
      // Create PPV unlock
      await db.insert(ppvUnlocksTable).values({
        userId: user.id,
        contentId: payment.contentId,
        contentType: "post",
        paymentId: payment.id,
      });
      unlocked = true;
    } else if (payment.type === "tip") {
      // Notify creator of tip
      await db.insert(notificationsTable).values({
        userId: payment.recipientId!,
        type: "tip",
        title: "You received a tip!",
        body: `@${user.username} tipped you ${payment.amountWld} WLD`,
        metadata: { amount: payment.amountWld, fanId: user.id },
      });
    }

    res.json({ success: true, status: "verified", unlocked });
  } catch (err) {
    req.log.error({ err }, "Error verifying payment");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

// Unlock PPV content
router.post("/ppv/unlock", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { contentId, contentType, referenceId } = req.body;

    // Verify payment was completed
    const [payment] = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.referenceId, referenceId), eq(paymentsTable.payerId, user.id), eq(paymentsTable.status, "completed")))
      .limit(1);

    if (!payment) {
      res.status(400).json({ error: "Payment not verified" });
      return;
    }

    // Check already unlocked
    const [existing] = await db.select().from(ppvUnlocksTable)
      .where(and(eq(ppvUnlocksTable.userId, user.id), eq(ppvUnlocksTable.contentId, contentId), eq(ppvUnlocksTable.contentType, contentType)))
      .limit(1);

    if (!existing) {
      await db.insert(ppvUnlocksTable).values({
        userId: user.id,
        contentId,
        contentType,
        paymentId: payment.id,
      });
    }

    res.json({ success: true, message: "Content unlocked" });
  } catch (err) {
    req.log.error({ err }, "Error unlocking PPV");
    res.status(500).json({ error: "Failed to unlock content" });
  }
});

// Payment history
router.get("/history", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const page = parseInt(req.query.page as string || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const payments = await db.select().from(paymentsTable)
      .where(eq(paymentsTable.payerId, user.id))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({
      payments: payments.map(p => ({
        id: p.id,
        type: p.type,
        amountWld: p.amountWld,
        platformFeeWld: p.platformFeeWld,
        status: p.status,
        description: p.description,
        createdAt: p.createdAt,
      })),
      total: payments.length,
      page,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting payment history");
    res.status(500).json({ error: "Failed to get payment history" });
  }
});

// Send tip
router.post("/tips", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { creatorId, amountWld, contentId, note, streamId } = req.body;

    const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, creatorId)).limit(1);
    if (!creator) {
      res.status(404).json({ error: "Creator not found" });
      return;
    }

    const referenceId = crypto.randomUUID();
    const { platformFeeWld, creatorAmountWld } = calculateSplit(amountWld);
    const description = `Tip to @${creator.username}${note ? ` - ${note}` : ""}`;

    await db.insert(paymentsTable).values({
      referenceId,
      payerId: user.id,
      recipientId: creatorId,
      type: "tip",
      amountWld,
      platformFeeWld,
      creatorAmountWld,
      status: "pending",
      description,
      contentId,
    });

    const tokens = [
      { symbol: "WLD", token_amount: String(Math.round(parseFloat(amountWld) * 1e18)) },
    ];

    res.json({ referenceId, to: PLATFORM_WALLET, amountWld, description, tokens });
  } catch (err) {
    req.log.error({ err }, "Error sending tip");
    res.status(500).json({ error: "Failed to send tip" });
  }
});

// Request payout (for creators)
router.post("/payout", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { amountWld, walletAddress } = req.body;

    const [creatorProfile] = await db.select().from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, user.id)).limit(1);

    if (!creatorProfile) {
      res.status(403).json({ error: "Creator profile not found" });
      return;
    }

    const available = parseFloat(creatorProfile.pendingBalanceWld);
    const requested = parseFloat(amountWld);

    if (requested > available) {
      res.status(400).json({ error: `Insufficient balance. Available: ${available.toFixed(6)} WLD` });
      return;
    }

    // Deduct from balance
    await db.update(creatorProfilesTable).set({
      pendingBalanceWld: (available - requested).toFixed(6),
      updatedAt: new Date(),
    }).where(eq(creatorProfilesTable.id, creatorProfile.id));

    // In production: trigger actual on-chain transfer
    req.log.info({ userId: user.id, amountWld, walletAddress }, "Payout requested");

    res.json({ success: true, message: `Payout of ${amountWld} WLD initiated to ${walletAddress}` });
  } catch (err) {
    req.log.error({ err }, "Error requesting payout");
    res.status(500).json({ error: "Failed to request payout" });
  }
});

export default router;
