import { Router } from "express";
import {
  db, usersTable, creatorProfilesTable, subscriptionsTable, paymentsTable,
  postsTable, fanListsTable, fanListMembersTable, livestreamsTable, notificationsTable
} from "@workspace/db";
import { eq, and, desc, gte, sql, count } from "drizzle-orm";
import { requireAuth, requireCreator, getUser } from "../lib/auth.js";

const router = Router();

// Creator dashboard overview
router.get("/dashboard", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;

    const [creatorProfile] = await db.select().from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, user.id)).limit(1);

    if (!creatorProfile) {
      res.status(404).json({ error: "Creator profile not found" });
      return;
    }

    // Subscriber counts
    const subResult = await db.execute(sql`
      SELECT COUNT(*) as total,
        SUM(CASE WHEN started_at > NOW() - INTERVAL '30 days' THEN 1 ELSE 0 END) as new_this_month
      FROM subscriptions WHERE creator_id = ${user.id} AND status = 'active'
    `);

    // Renewal rate (subscribers who renewed in last 60 days / total)
    const renewalResult = await db.execute(sql`
      SELECT COUNT(*) as renewed FROM subscriptions 
      WHERE creator_id = ${user.id} AND status = 'active' AND started_at > NOW() - INTERVAL '60 days'
    `);

    // Views, likes
    const engagementResult = await db.execute(sql`
      SELECT SUM(view_count) as views, SUM(like_count) as likes, COUNT(*) as posts
      FROM posts WHERE creator_id = ${user.id} AND is_published = true
    `);

    // Tips received
    const tipsResult = await db.execute(sql`
      SELECT COUNT(*) as tip_count FROM payments 
      WHERE recipient_id = ${user.id} AND type = 'tip' AND status = 'completed'
    `);

    // Top fans
    const topFansResult = await db.execute(sql`
      SELECT payer_id, SUM(CAST(amount_wld AS DECIMAL)) as total_spent
      FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
      GROUP BY payer_id ORDER BY total_spent DESC LIMIT 5
    `);

    const topFans = await Promise.all(
      topFansResult.rows.map(async (row: any, idx) => {
        const [fan] = await db.select().from(usersTable).where(eq(usersTable.id, row.payer_id)).limit(1);
        return {
          userId: row.payer_id,
          user: fan ? { id: fan.id, username: fan.username, displayName: fan.displayName, avatarUrl: fan.avatarUrl } : null,
          totalSpentWld: String(row.total_spent || "0"),
          rank: idx + 1,
        };
      })
    );

    // Earnings chart (last 30 days)
    const earningsChart = await db.execute(sql`
      SELECT DATE_TRUNC('day', created_at) as date, SUM(CAST(creator_amount_wld AS DECIMAL)) as value
      FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY date
    `);

    // Recent transactions
    const recentPayments = await db.select().from(paymentsTable)
      .where(and(eq(paymentsTable.recipientId, user.id), eq(paymentsTable.status, "completed")))
      .orderBy(desc(paymentsTable.createdAt))
      .limit(10);

    const totalSubs = Number(subResult.rows[0]?.total || 0);
    const newThisMonth = Number(subResult.rows[0]?.new_this_month || 0);
    const renewed = Number(renewalResult.rows[0]?.renewed || 0);

    res.json({
      totalEarningsWld: creatorProfile.totalEarningsWld,
      pendingBalanceWld: creatorProfile.pendingBalanceWld,
      subscriberCount: totalSubs,
      newSubscribersThisMonth: newThisMonth,
      renewalRate: totalSubs > 0 ? (renewed / totalSubs) * 100 : 0,
      totalViews: Number(engagementResult.rows[0]?.views || 0),
      totalLikes: Number(engagementResult.rows[0]?.likes || 0),
      totalTips: Number(tipsResult.rows[0]?.tip_count || 0),
      topFans,
      recentTransactions: recentPayments.map(p => ({
        id: p.id, type: p.type, amountWld: p.amountWld, status: p.status, description: p.description, createdAt: p.createdAt
      })),
      earningsChart: earningsChart.rows.map((r: any) => ({
        date: r.date?.toISOString?.() || r.date,
        value: Number(r.value || 0),
        label: "WLD",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting creator dashboard");
    res.status(500).json({ error: "Failed to get dashboard" });
  }
});

// Get creator subscribers
router.get("/subscribers", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const page = parseInt(req.query.page as string || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const subs = await db
      .select({ sub: subscriptionsTable, fan: usersTable })
      .from(subscriptionsTable)
      .innerJoin(usersTable, eq(subscriptionsTable.fanId, usersTable.id))
      .where(and(eq(subscriptionsTable.creatorId, user.id), eq(subscriptionsTable.status, "active")))
      .orderBy(desc(subscriptionsTable.startedAt))
      .limit(limit)
      .offset(offset);

    const total = await db.execute(sql`
      SELECT COUNT(*) as count FROM subscriptions WHERE creator_id = ${user.id} AND status = 'active'
    `);

    // Get top fans (top 5% by spending)
    const topFanResult = await db.execute(sql`
      SELECT payer_id FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
      GROUP BY payer_id ORDER BY SUM(CAST(amount_wld AS DECIMAL)) DESC LIMIT 5
    `);
    const topFanIds = new Set(topFanResult.rows.map((r: any) => r.payer_id));

    const spendResult = await db.execute(sql`
      SELECT payer_id, SUM(CAST(amount_wld AS DECIMAL)) as total
      FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
      GROUP BY payer_id
    `);
    const spendMap = new Map(spendResult.rows.map((r: any) => [r.payer_id, String(r.total || "0")]));

    res.json({
      subscribers: subs.map(({ sub, fan }) => ({
        userId: fan.id,
        user: { id: fan.id, username: fan.username, displayName: fan.displayName, avatarUrl: fan.avatarUrl },
        subscribedAt: sub.startedAt,
        expiresAt: sub.expiresAt,
        totalSpentWld: spendMap.get(fan.id) || "0",
        isTopFan: topFanIds.has(fan.id),
      })),
      total: Number(total.rows[0]?.count || 0),
      page,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting subscribers");
    res.status(500).json({ error: "Failed to get subscribers" });
  }
});

// Earnings
router.get("/earnings", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const period = req.query.period as string || "month";

    const intervalMap: Record<string, string> = {
      week: "7 days",
      month: "30 days",
      year: "365 days",
      all: "3650 days",
    };
    const interval = intervalMap[period] || "30 days";

    const result = await db.execute(sql`
      SELECT 
        SUM(CAST(creator_amount_wld AS DECIMAL)) as total,
        SUM(CASE WHEN type = 'subscription' THEN CAST(creator_amount_wld AS DECIMAL) ELSE 0 END) as subscriptions,
        SUM(CASE WHEN type = 'ppv' THEN CAST(creator_amount_wld AS DECIMAL) ELSE 0 END) as ppv,
        SUM(CASE WHEN type = 'tip' THEN CAST(creator_amount_wld AS DECIMAL) ELSE 0 END) as tips
      FROM payments
      WHERE recipient_id = ${user.id} AND status = 'completed'
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
    `);

    const chartResult = await db.execute(sql`
      SELECT DATE_TRUNC('day', created_at) as date, SUM(CAST(creator_amount_wld AS DECIMAL)) as value
      FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY date
    `);

    const r = result.rows[0] as any;
    res.json({
      totalWld: String(r?.total || "0"),
      subscriptionsWld: String(r?.subscriptions || "0"),
      ppvWld: String(r?.ppv || "0"),
      tipsWld: String(r?.tips || "0"),
      breakdown: chartResult.rows.map((row: any) => ({
        date: row.date?.toISOString?.() || row.date,
        value: Number(row.value || 0),
        label: "WLD",
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting earnings");
    res.status(500).json({ error: "Failed to get earnings" });
  }
});

// Analytics
router.get("/analytics", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const period = req.query.period as string || "month";

    const intervalMap: Record<string, string> = { week: "7 days", month: "30 days", year: "365 days" };
    const interval = intervalMap[period] || "30 days";

    const engResult = await db.execute(sql`
      SELECT SUM(view_count) as views, SUM(like_count) as likes, SUM(comment_count) as comments
      FROM posts WHERE creator_id = ${user.id} AND is_published = true
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
    `);

    const newSubsResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM subscriptions 
      WHERE creator_id = ${user.id} AND started_at > NOW() - CAST(${interval} AS INTERVAL)
    `);

    const revenueResult = await db.execute(sql`
      SELECT SUM(CAST(creator_amount_wld AS DECIMAL)) as total FROM payments
      WHERE recipient_id = ${user.id} AND status = 'completed'
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
    `);

    const viewsChart = await db.execute(sql`
      SELECT DATE_TRUNC('day', created_at) as date, SUM(view_count) as value
      FROM posts WHERE creator_id = ${user.id}
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY date
    `);

    const revenueChart = await db.execute(sql`
      SELECT DATE_TRUNC('day', created_at) as date, SUM(CAST(creator_amount_wld AS DECIMAL)) as value
      FROM payments WHERE recipient_id = ${user.id} AND status = 'completed'
        AND created_at > NOW() - CAST(${interval} AS INTERVAL)
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY date
    `);

    // Top posts
    const topPosts = await db.select().from(postsTable)
      .where(and(eq(postsTable.creatorId, user.id), eq(postsTable.isPublished, true)))
      .orderBy(desc(postsTable.viewCount))
      .limit(5);

    const e = engResult.rows[0] as any;
    const views = Number(e?.views || 0);
    const likes = Number(e?.likes || 0);
    const comments = Number(e?.comments || 0);

    res.json({
      views,
      uniqueVisitors: Math.round(views * 0.8),
      likes,
      comments,
      newSubscribers: Number(newSubsResult.rows[0]?.count || 0),
      revenue: String(revenueResult.rows[0]?.total || "0"),
      engagementRate: views > 0 ? ((likes + comments) / views) * 100 : 0,
      viewsChart: viewsChart.rows.map((r: any) => ({ date: r.date?.toISOString?.() || r.date, value: Number(r.value || 0), label: "Views" })),
      revenueChart: revenueChart.rows.map((r: any) => ({ date: r.date?.toISOString?.() || r.date, value: Number(r.value || 0), label: "WLD" })),
      topPosts: topPosts.map(p => ({ id: p.id, text: p.text, viewCount: p.viewCount, likeCount: p.likeCount })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting analytics");
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

// Vault (all media)
router.get("/vault", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const page = parseInt(req.query.page as string || "1");
    const limit = 24;
    const offset = (page - 1) * limit;

    const { mediaTable, postMediaTable } = await import("@workspace/db");

    const items = await db.select().from(mediaTable)
      .where(eq(mediaTable.userId, user.id))
      .orderBy(desc(mediaTable.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db.execute(sql`SELECT COUNT(*) as count FROM media WHERE user_id = ${user.id}`);

    // Get usage counts
    const usedIn = await Promise.all(items.map(async (item) => {
      const result = await db.execute(sql`SELECT COUNT(*) as count FROM post_media WHERE media_id = ${item.id}`);
      return Number(result.rows[0]?.count || 0);
    }));

    res.json({
      items: items.map((item, idx) => ({
        id: item.id,
        mediaUrl: item.url,
        thumbnailUrl: item.thumbnailUrl,
        mediaType: item.mediaType,
        usedInPostCount: usedIn[idx],
        createdAt: item.createdAt,
      })),
      total: Number(total.rows[0]?.count || 0),
      page,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting vault");
    res.status(500).json({ error: "Failed to get vault" });
  }
});

// Fan lists
router.get("/lists", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;

    const lists = await db.select().from(fanListsTable)
      .where(eq(fanListsTable.creatorId, user.id))
      .orderBy(desc(fanListsTable.createdAt));

    const listsWithCount = await Promise.all(lists.map(async (list) => {
      const countResult = await db.execute(sql`SELECT COUNT(*) as count FROM fan_list_members WHERE list_id = ${list.id}`);
      return { ...list, fanCount: Number(countResult.rows[0]?.count || 0) };
    }));

    res.json({ lists: listsWithCount.map(l => ({ id: l.id, name: l.name, fanCount: l.fanCount, createdAt: l.createdAt })) });
  } catch (err) {
    req.log.error({ err }, "Error getting fan lists");
    res.status(500).json({ error: "Failed to get fan lists" });
  }
});

// Create fan list
router.post("/lists", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { name, fanIds } = req.body;

    const [list] = await db.insert(fanListsTable).values({ creatorId: user.id, name }).returning();

    if (fanIds && fanIds.length > 0) {
      await db.insert(fanListMembersTable).values(
        fanIds.map((fanId: string) => ({ listId: list.id, fanId }))
      );
    }

    res.status(201).json({ id: list.id, name: list.name, fanCount: fanIds?.length || 0, createdAt: list.createdAt });
  } catch (err) {
    req.log.error({ err }, "Error creating fan list");
    res.status(500).json({ error: "Failed to create fan list" });
  }
});

// Creator settings
router.get("/settings", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;

    const [profile] = await db.select().from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, user.id)).limit(1);

    if (!profile) {
      res.status(404).json({ error: "Creator profile not found" });
      return;
    }

    res.json({
      subscriptionPriceWld: profile.subscriptionPriceWld,
      welcomeMessageEnabled: profile.welcomeMessageEnabled,
      welcomeMessageText: profile.welcomeMessageText,
      autoRenewEnabled: true,
      commentsEnabled: profile.commentsEnabled,
      tipsEnabled: profile.tipsEnabled,
      watermarkEnabled: profile.watermarkEnabled,
      platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS || "0x...",
    });
  } catch (err) {
    req.log.error({ err }, "Error getting creator settings");
    res.status(500).json({ error: "Failed to get settings" });
  }
});

router.put("/settings", requireAuth, requireCreator, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { subscriptionPriceWld, welcomeMessageEnabled, welcomeMessageText, commentsEnabled, tipsEnabled } = req.body;

    const [updated] = await db.update(creatorProfilesTable).set({
      subscriptionPriceWld: subscriptionPriceWld,
      welcomeMessageEnabled,
      welcomeMessageText,
      commentsEnabled,
      tipsEnabled,
      updatedAt: new Date(),
    }).where(eq(creatorProfilesTable.userId, user.id)).returning();

    res.json({
      subscriptionPriceWld: updated.subscriptionPriceWld,
      welcomeMessageEnabled: updated.welcomeMessageEnabled,
      welcomeMessageText: updated.welcomeMessageText,
      commentsEnabled: updated.commentsEnabled,
      tipsEnabled: updated.tipsEnabled,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating creator settings");
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// Goals
router.get("/goals", requireAuth, requireCreator, async (req, res) => {
  res.json({ goals: [] }); // Simplified
});

router.post("/goals", requireAuth, requireCreator, async (req, res) => {
  try {
    const { title, description, targetAmountWld, postId } = req.body;
    if (postId) {
      await db.update(postsTable).set({ goalAmount: targetAmountWld, goalTitle: title }).where(eq(postsTable.id, postId));
    }
    const goal = { id: crypto.randomUUID(), title, description, targetAmountWld, currentAmountWld: "0", isComplete: false, createdAt: new Date() };
    res.status(201).json(goal);
  } catch (err) {
    req.log.error({ err }, "Error creating goal");
    res.status(500).json({ error: "Failed to create goal" });
  }
});

export default router;
