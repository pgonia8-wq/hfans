import { Router } from "express";
import {
  db, messagesTable, usersTable, fanListsTable, fanListMembersTable, subscriptionsTable
} from "@workspace/db";
import { eq, and, or, desc, ne, sql } from "drizzle-orm";
import { requireAuth, getUser } from "../lib/auth.js";

const router = Router();

// Get conversations list
router.get("/conversations", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;

    // Get unique conversation partners
    const result = await db.execute(sql`
      SELECT 
        CASE 
          WHEN sender_id = ${user.id} THEN receiver_id 
          ELSE sender_id 
        END as other_user_id,
        MAX(created_at) as last_message_at
      FROM messages
      WHERE sender_id = ${user.id} OR receiver_id = ${user.id}
      GROUP BY other_user_id
      ORDER BY last_message_at DESC
      LIMIT 50
    `);

    const conversations = await Promise.all(
      result.rows.map(async (row: any) => {
        const otherUserId = row.other_user_id;

        const [otherUser] = await db.select().from(usersTable)
          .where(eq(usersTable.id, otherUserId)).limit(1);

        const [lastMsg] = await db.select().from(messagesTable)
          .where(or(
            and(eq(messagesTable.senderId, user.id), eq(messagesTable.receiverId, otherUserId)),
            and(eq(messagesTable.senderId, otherUserId), eq(messagesTable.receiverId, user.id))
          ))
          .orderBy(desc(messagesTable.createdAt))
          .limit(1);

        const unreadResult = await db.execute(sql`
          SELECT COUNT(*) as count FROM messages 
          WHERE sender_id = ${otherUserId} AND receiver_id = ${user.id} AND is_read = false
        `);

        return {
          userId: otherUserId,
          user: otherUser ? {
            id: otherUser.id,
            username: otherUser.username,
            displayName: otherUser.displayName,
            avatarUrl: otherUser.avatarUrl,
          } : null,
          lastMessage: lastMsg ? {
            id: lastMsg.id,
            text: lastMsg.isPpv && !lastMsg.isUnlocked ? null : lastMsg.text,
            isPpv: lastMsg.isPpv,
            ppvPriceWld: lastMsg.ppvPriceWld,
            isRead: lastMsg.isRead,
            createdAt: lastMsg.createdAt,
          } : null,
          unreadCount: Number(unreadResult.rows[0]?.count || 0),
        };
      })
    );

    res.json({ conversations });
  } catch (err) {
    req.log.error({ err }, "Error getting conversations");
    res.status(500).json({ error: "Failed to get conversations" });
  }
});

// Get messages in conversation
router.get("/conversations/:userId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { userId } = req.params;
    const page = parseInt(req.query.page as string || "1");
    const limit = 50;
    const offset = (page - 1) * limit;

    const messages = await db.select().from(messagesTable)
      .where(or(
        and(eq(messagesTable.senderId, user.id), eq(messagesTable.receiverId, userId)),
        and(eq(messagesTable.senderId, userId), eq(messagesTable.receiverId, user.id))
      ))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Mark as read
    await db.update(messagesTable)
      .set({ isRead: true })
      .where(and(eq(messagesTable.senderId, userId), eq(messagesTable.receiverId, user.id), eq(messagesTable.isRead, false)));

    const total = await db.execute(sql`
      SELECT COUNT(*) as count FROM messages
      WHERE (sender_id = ${user.id} AND receiver_id = ${userId})
         OR (sender_id = ${userId} AND receiver_id = ${user.id})
    `);

    res.json({
      messages: messages.reverse().map(m => ({
        id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        text: m.isPpv && !m.isUnlocked && m.receiverId === user.id ? null : m.text,
        mediaUrl: m.isPpv && !m.isUnlocked && m.receiverId === user.id ? null : m.mediaUrl,
        mediaType: m.mediaType,
        isPpv: m.isPpv,
        ppvPriceWld: m.ppvPriceWld,
        isUnlocked: m.isUnlocked || m.senderId === user.id,
        isRead: m.isRead,
        createdAt: m.createdAt,
      })),
      total: Number(total.rows[0]?.count || 0),
      page,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting messages");
    res.status(500).json({ error: "Failed to get messages" });
  }
});

// Send message
router.post("/conversations/:userId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { userId } = req.params;
    const { text, mediaId, isPpv, ppvPriceWld } = req.body;

    if (!text && !mediaId) {
      res.status(400).json({ error: "Message text or media required" });
      return;
    }

    const [message] = await db.insert(messagesTable).values({
      senderId: user.id,
      receiverId: userId,
      text,
      isPpv: isPpv || false,
      ppvPriceWld: isPpv ? ppvPriceWld : null,
      isUnlocked: !isPpv,
    }).returning();

    res.status(201).json({
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      text: message.text,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      isPpv: message.isPpv,
      ppvPriceWld: message.ppvPriceWld,
      isUnlocked: message.isUnlocked,
      isRead: message.isRead,
      createdAt: message.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error sending message");
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Mass DM
router.post("/mass-dm", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { text, mediaId, isPpv, ppvPriceWld, listId } = req.body;

    if (!text) {
      res.status(400).json({ error: "Message text required" });
      return;
    }

    // Get recipients
    let recipientIds: string[] = [];

    if (listId) {
      const members = await db.select().from(fanListMembersTable)
        .where(eq(fanListMembersTable.listId, listId));
      recipientIds = members.map(m => m.fanId);
    } else {
      // Send to all active subscribers
      const subs = await db.select().from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.creatorId, user.id), eq(subscriptionsTable.status, "active")));
      recipientIds = subs.map(s => s.fanId);
    }

    if (recipientIds.length === 0) {
      res.json({ success: true, message: "No recipients found" });
      return;
    }

    // Insert messages in batch
    await db.insert(messagesTable).values(
      recipientIds.map(receiverId => ({
        senderId: user.id,
        receiverId,
        text,
        isPpv: isPpv || false,
        ppvPriceWld: isPpv ? ppvPriceWld : null,
        isUnlocked: !isPpv,
        isMassDm: true,
      }))
    );

    res.json({ success: true, message: `Mass DM sent to ${recipientIds.length} subscribers` });
  } catch (err) {
    req.log.error({ err }, "Error sending mass DM");
    res.status(500).json({ error: "Failed to send mass DM" });
  }
});

export default router;
