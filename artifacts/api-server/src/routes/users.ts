import { Router } from "express";
import { db, usersTable, creatorProfilesTable, subscriptionsTable } from "@workspace/db";
import { eq, and, ilike, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

// Get user profile by username
router.get("/:username", async (req, res) => {
  try {
    const { username } = req.params;
    const currentUser = getUser(req);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.username, username))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "Not found", message: "User not found" });
      return;
    }

    const [creatorProfile] = await db
      .select()
      .from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, user.id))
      .limit(1);

    // Check subscription status
    let isSubscribed = false;
    if (currentUser) {
      const [sub] = await db
        .select()
        .from(subscriptionsTable)
        .where(
          and(
            eq(subscriptionsTable.fanId, currentUser.id),
            eq(subscriptionsTable.creatorId, user.id),
            eq(subscriptionsTable.status, "active")
          )
        )
        .limit(1);
      isSubscribed = !!sub;
    }

    // Get counts
    const postCountResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM posts WHERE creator_id = ${user.id} AND is_published = true`
    );

    const subscriberCountResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM subscriptions WHERE creator_id = ${user.id} AND status = 'active'`
    );

    res.json({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      bannerUrl: user.bannerUrl,
      subscriptionPriceWld: creatorProfile?.subscriptionPriceWld || "1.0",
      subscriberCount: Number(subscriberCountResult.rows[0]?.count || 0),
      postCount: Number(postCountResult.rows[0]?.count || 0),
      isSubscribed,
      isVerified: creatorProfile?.status === "approved",
      isWorldIdVerified: user.isWorldIdVerified,
      socialLinks: {
        twitter: user.twitterHandle,
        instagram: user.instagramHandle,
        tiktok: user.tiktokHandle,
        spotify: user.spotifyUrl,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Error getting user profile");
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// Update own profile
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { displayName, bio, avatarUrl, bannerUrl, socialLinks } = req.body;

    const [updated] = await db
      .update(usersTable)
      .set({
        displayName: displayName ?? user.displayName,
        bio: bio ?? user.bio,
        avatarUrl: avatarUrl ?? user.avatarUrl,
        bannerUrl: bannerUrl ?? user.bannerUrl,
        twitterHandle: socialLinks?.twitter,
        instagramHandle: socialLinks?.instagram,
        tiktokHandle: socialLinks?.tiktok,
        spotifyUrl: socialLinks?.spotify,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id))
      .returning();

    res.json({
      id: updated.id,
      username: updated.username,
      displayName: updated.displayName,
      bio: updated.bio,
      avatarUrl: updated.avatarUrl,
      bannerUrl: updated.bannerUrl,
      role: updated.role,
      isWorldIdVerified: updated.isWorldIdVerified,
    });
  } catch (err) {
    req.log.error({ err }, "Error updating profile");
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// Apply to become creator
router.post("/become-creator", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;

    if (user.role === "creator") {
      res.status(400).json({ error: "Already a creator" });
      return;
    }

    // Check World ID verification
    if (!user.isWorldIdVerified) {
      res.status(400).json({ error: "World ID verification required to become a creator" });
      return;
    }

    const { displayName, bio, subscriptionPriceWld, contentCategories } = req.body;

    // Update user role
    await db
      .update(usersTable)
      .set({ role: "creator", displayName: displayName || user.displayName, bio: bio || user.bio, updatedAt: new Date() })
      .where(eq(usersTable.id, user.id));

    // Create/update creator profile
    const [existing] = await db
      .select()
      .from(creatorProfilesTable)
      .where(eq(creatorProfilesTable.userId, user.id))
      .limit(1);

    if (!existing) {
      await db.insert(creatorProfilesTable).values({
        userId: user.id,
        subscriptionPriceWld: subscriptionPriceWld || "1.0",
        status: "approved", // Auto-approve for now (in production: pending manual review)
        approvedAt: new Date(),
        contentCategories,
        welcomeMessageText: `Thanks for subscribing! 🔥`,
      });
    }

    res.json({ success: true, message: "Creator account activated successfully" });
  } catch (err) {
    req.log.error({ err }, "Error becoming creator");
    res.status(500).json({ error: "Failed to become creator" });
  }
});

// Search creators
router.get("/search/creators", async (req, res) => {
  try {
    const { q, page = "1" } = req.query;
    const pageNum = parseInt(page as string);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    if (!q) {
      res.status(400).json({ error: "Search query required" });
      return;
    }

    const creators = await db
      .select()
      .from(usersTable)
      .where(
        and(
          eq(usersTable.role, "creator"),
          ilike(usersTable.username, `%${q}%`)
        )
      )
      .limit(limit)
      .offset(offset);

    res.json({
      creators: creators.map(c => ({
        id: c.id,
        username: c.username,
        displayName: c.displayName,
        bio: c.bio,
        avatarUrl: c.avatarUrl,
        bannerUrl: c.bannerUrl,
        isWorldIdVerified: c.isWorldIdVerified,
      })),
      total: creators.length,
      page: pageNum,
    });
  } catch (err) {
    req.log.error({ err }, "Error searching creators");
    res.status(500).json({ error: "Search failed" });
  }
});

// Get notifications
router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { page = "1" } = req.query;
    const pageNum = parseInt(page as string);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const { notificationsTable } = await import("@workspace/db");
    const { desc } = await import("drizzle-orm");

    const notifications = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, user.id))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const unreadResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM notifications WHERE user_id = ${user.id} AND is_read = false`
    );

    res.json({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        createdAt: n.createdAt,
        metadata: n.metadata,
      })),
      unreadCount: Number(unreadResult.rows[0]?.count || 0),
      total: notifications.length,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting notifications");
    res.status(500).json({ error: "Failed to get notifications" });
  }
});

export default router;
