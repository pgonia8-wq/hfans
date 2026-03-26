import { Router } from "express";
import {
  db, livestreamsTable, livestreamViewersTable, usersTable, paymentsTable, notificationsTable, creatorProfilesTable
} from "@workspace/db";
import { eq, and, eq as eqOp, desc, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

const PLATFORM_WALLET = process.env.PLATFORM_WALLET_ADDRESS || "0x0000000000000000000000000000000000000001";

// Start livestream
router.post("/start", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { title, isPpv, ppvPriceWld, tipMenuItems } = req.body;

    // End any existing active stream
    await db.update(livestreamsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(livestreamsTable.creatorId, user.id), eq(livestreamsTable.status, "live")));

    const roomName = `hfans-${user.id}-${Date.now()}`;

    const [stream] = await db.insert(livestreamsTable).values({
      creatorId: user.id,
      title,
      roomName,
      status: "live",
      isPpv: isPpv || false,
      ppvPriceWld: isPpv ? ppvPriceWld : null,
      tipMenuItems: tipMenuItems || [
        { label: "Love 💕", amountWld: "0.1" },
        { label: "Fire 🔥", amountWld: "0.5" },
        { label: "Crown 👑", amountWld: "1.0" },
        { label: "Diamond 💎", amountWld: "5.0" },
      ],
      startedAt: new Date(),
    }).returning();

    // Notify subscribers
    const { subscriptionsTable } = await import("@workspace/db");
    const subs = await db.select().from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.creatorId, user.id), eq(subscriptionsTable.status, "active")));

    if (subs.length > 0) {
      await db.insert(notificationsTable).values(
        subs.map(sub => ({
          userId: sub.fanId,
          type: "livestream",
          title: `@${user.username} is live!`,
          body: title,
          metadata: { streamId: stream.id },
        }))
      );
    }

    // In production: generate LiveKit token
    const token = `livekit-token-${stream.id}-creator`;
    const serverUrl = process.env.LIVEKIT_URL || "wss://livekit.hfans.app";

    res.json({
      streamId: stream.id,
      roomName,
      token,
      serverUrl,
    });
  } catch (err) {
    req.log.error({ err }, "Error starting livestream");
    res.status(500).json({ error: "Failed to start livestream" });
  }
});

// End livestream
router.post("/end", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;

    await db.update(livestreamsTable)
      .set({ status: "ended", endedAt: new Date() })
      .where(and(eq(livestreamsTable.creatorId, user.id), eq(livestreamsTable.status, "live")));

    res.json({ success: true, message: "Stream ended" });
  } catch (err) {
    req.log.error({ err }, "Error ending livestream");
    res.status(500).json({ error: "Failed to end livestream" });
  }
});

// Get active livestreams
router.get("/active", async (req, res) => {
  try {
    const streams = await db
      .select({ stream: livestreamsTable, creator: usersTable })
      .from(livestreamsTable)
      .innerJoin(usersTable, eq(livestreamsTable.creatorId, usersTable.id))
      .where(eq(livestreamsTable.status, "live"))
      .orderBy(desc(livestreamsTable.viewerCount))
      .limit(20);

    res.json({
      streams: streams.map(({ stream, creator }) => ({
        id: stream.id,
        creatorId: stream.creatorId,
        creator: {
          id: creator.id,
          username: creator.username,
          displayName: creator.displayName,
          avatarUrl: creator.avatarUrl,
        },
        title: stream.title,
        viewerCount: stream.viewerCount,
        isPpv: stream.isPpv,
        ppvPriceWld: stream.ppvPriceWld,
        tipMenuItems: stream.tipMenuItems,
        startedAt: stream.startedAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting active streams");
    res.status(500).json({ error: "Failed to get streams" });
  }
});

// Join livestream
router.post("/join/:streamId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { streamId } = req.params;

    const [stream] = await db.select().from(livestreamsTable)
      .where(eq(livestreamsTable.id, streamId)).limit(1);

    if (!stream || stream.status !== "live") {
      res.status(404).json({ error: "Stream not found or not live" });
      return;
    }

    // Check PPV access
    let isUnlocked = !stream.isPpv;
    if (stream.isPpv && user.id !== stream.creatorId) {
      const { ppvUnlocksTable } = await import("@workspace/db");
      const [unlock] = await db.select().from(ppvUnlocksTable)
        .where(and(
          eq(ppvUnlocksTable.userId, user.id),
          eq(ppvUnlocksTable.contentId, streamId),
          eq(ppvUnlocksTable.contentType, "stream")
        )).limit(1);
      isUnlocked = !!unlock;
    }

    // Track viewer
    await db.insert(livestreamViewersTable).values({
      streamId,
      userId: user.id,
    });

    // Increment viewer count
    await db.update(livestreamsTable)
      .set({ viewerCount: sql`viewer_count + 1` })
      .where(eq(livestreamsTable.id, streamId));

    // Generate viewer token
    const token = `livekit-token-${streamId}-viewer-${user.id}`;
    const serverUrl = process.env.LIVEKIT_URL || "wss://livekit.hfans.app";

    res.json({
      token,
      serverUrl,
      isPpv: stream.isPpv,
      ppvPriceWld: stream.ppvPriceWld,
      isUnlocked,
    });
  } catch (err) {
    req.log.error({ err }, "Error joining livestream");
    res.status(500).json({ error: "Failed to join livestream" });
  }
});

export default router;
