import { Router } from "express";
import {
  db, usersTable, postsTable, mediaTable, postMediaTable, pollOptionsTable, pollVotesTable,
  likesTable, bookmarksTable, commentsTable, storiesTable, ppvUnlocksTable, subscriptionsTable,
  notificationsTable
} from "@workspace/db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { requireAuth, optionalAuth, getUser } from "../lib/auth.js";

const router = Router();

async function enrichPost(post: any, currentUserId?: string) {
  // Get media
  const mediaItems = await db
    .select({ media: mediaTable })
    .from(postMediaTable)
    .innerJoin(mediaTable, eq(postMediaTable.mediaId, mediaTable.id))
    .where(eq(postMediaTable.postId, post.id))
    .orderBy(postMediaTable.sortOrder);

  // Get creator info
  const [creator] = await db.select().from(usersTable).where(eq(usersTable.id, post.creatorId)).limit(1);

  // Check like/bookmark status for current user
  let isLiked = false;
  let isBookmarked = false;
  let isUnlocked = false;

  if (currentUserId) {
    const [like] = await db.select().from(likesTable)
      .where(and(eq(likesTable.postId, post.id), eq(likesTable.userId, currentUserId)))
      .limit(1);
    isLiked = !!like;

    const [bookmark] = await db.select().from(bookmarksTable)
      .where(and(eq(bookmarksTable.postId, post.id), eq(bookmarksTable.userId, currentUserId)))
      .limit(1);
    isBookmarked = !!bookmark;

    if (post.isPpv) {
      const [unlock] = await db.select().from(ppvUnlocksTable)
        .where(and(eq(ppvUnlocksTable.userId, currentUserId), eq(ppvUnlocksTable.contentId, post.id), eq(ppvUnlocksTable.contentType, "post")))
        .limit(1);
      isUnlocked = !!unlock;

      // Subscriber check
      if (!isUnlocked && post.isFreeForSubscribers) {
        const [sub] = await db.select().from(subscriptionsTable)
          .where(and(eq(subscriptionsTable.fanId, currentUserId), eq(subscriptionsTable.creatorId, post.creatorId), eq(subscriptionsTable.status, "active")))
          .limit(1);
        isUnlocked = !!sub;
      }
    } else {
      // Check if user is subscribed or it's free
      if (post.isFreeForSubscribers && post.creatorId !== currentUserId) {
        const [sub] = await db.select().from(subscriptionsTable)
          .where(and(eq(subscriptionsTable.fanId, currentUserId), eq(subscriptionsTable.creatorId, post.creatorId), eq(subscriptionsTable.status, "active")))
          .limit(1);
        isUnlocked = !!sub || !post.isFreeForSubscribers;
      } else {
        isUnlocked = true;
      }
    }

    // Creator can always see own content
    if (currentUserId === post.creatorId) isUnlocked = true;
  }

  // Get poll options if applicable
  let pollOptions = [];
  if (post.postType === "poll") {
    pollOptions = await db.select().from(pollOptionsTable).where(eq(pollOptionsTable.postId, post.id)).orderBy(pollOptionsTable.sortOrder);
  }

  // Blur media if locked
  const processedMedia = mediaItems.map(({ media }) => ({
    id: media.id,
    url: isUnlocked ? media.url : null,
    type: media.mediaType,
    thumbnailUrl: media.thumbnailUrl,
    blurUrl: media.blurUrl || media.thumbnailUrl,
    duration: media.duration,
  }));

  return {
    id: post.id,
    creatorId: post.creatorId,
    creator: creator ? {
      id: creator.id,
      username: creator.username,
      displayName: creator.displayName,
      avatarUrl: creator.avatarUrl,
      isWorldIdVerified: creator.isWorldIdVerified,
    } : null,
    text: isUnlocked || !post.isPpv ? post.text : null,
    media: processedMedia,
    isPpv: post.isPpv,
    ppvPriceWld: post.ppvPriceWld,
    isUnlocked,
    isFreeForSubscribers: post.isFreeForSubscribers,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    isLiked,
    isBookmarked,
    postType: post.postType,
    pollOptions,
    goalAmount: post.goalAmount,
    goalCurrent: post.goalCurrent,
    goalTitle: post.goalTitle,
    createdAt: post.createdAt,
  };
}

// Get feed
router.get("/feed", optionalAuth, async (req, res) => {
  try {
    const currentUser = getUser(req);
    const page = parseInt(req.query.page as string || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    let posts: any[];

    if (currentUser) {
      // Get posts from subscribed creators + own posts
      const subs = await db
        .select({ creatorId: subscriptionsTable.creatorId })
        .from(subscriptionsTable)
        .where(and(eq(subscriptionsTable.fanId, currentUser.id), eq(subscriptionsTable.status, "active")));

      const creatorIds = subs.map(s => s.creatorId);
      creatorIds.push(currentUser.id);

      if (creatorIds.length > 0) {
        posts = await db
          .select()
          .from(postsTable)
          .where(and(eq(postsTable.isPublished, true), inArray(postsTable.creatorId, creatorIds)))
          .orderBy(desc(postsTable.createdAt))
          .limit(limit)
          .offset(offset);
      } else {
        posts = await db.select().from(postsTable)
          .where(eq(postsTable.isPublished, true))
          .orderBy(desc(postsTable.createdAt))
          .limit(limit)
          .offset(offset);
      }
    } else {
      // Discovery feed - sample public posts
      posts = await db.select().from(postsTable)
        .where(eq(postsTable.isPublished, true))
        .orderBy(desc(postsTable.createdAt))
        .limit(limit)
        .offset(offset);
    }

    const enriched = await Promise.all(posts.map(p => enrichPost(p, currentUser?.id)));

    const total = await db.execute(sql`SELECT COUNT(*) as count FROM posts WHERE is_published = true`);

    res.json({
      posts: enriched,
      total: Number(total.rows[0]?.count || 0),
      page,
      hasMore: posts.length === limit,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting feed");
    res.status(500).json({ error: "Failed to get feed" });
  }
});

// List posts (by creator)
router.get("/posts", optionalAuth, async (req, res) => {
  try {
    const currentUser = getUser(req);
    const { creatorId, page = "1" } = req.query;
    const pageNum = parseInt(page as string);
    const limit = 20;
    const offset = (pageNum - 1) * limit;

    const conditions = [eq(postsTable.isPublished, true)];
    if (creatorId) conditions.push(eq(postsTable.creatorId, creatorId as string));

    const posts = await db
      .select()
      .from(postsTable)
      .where(and(...conditions))
      .orderBy(desc(postsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const enriched = await Promise.all(posts.map(p => enrichPost(p, currentUser?.id)));

    const totalResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM posts WHERE is_published = true${creatorId ? sql` AND creator_id = ${creatorId}` : sql``}`
    );

    res.json({
      posts: enriched,
      total: Number(totalResult.rows[0]?.count || 0),
      page: pageNum,
      hasMore: posts.length === limit,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting posts");
    res.status(500).json({ error: "Failed to get posts" });
  }
});

// Create post
router.post("/posts", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { text, mediaIds, isPpv, ppvPriceWld, isFreeForSubscribers, postType, pollOptions, pollEndsAt, scheduledAt, goalAmount, goalTitle } = req.body;

    const [post] = await db
      .insert(postsTable)
      .values({
        creatorId: user.id,
        text,
        postType: postType || "text",
        isPpv: isPpv || false,
        ppvPriceWld: isPpv ? ppvPriceWld : null,
        isFreeForSubscribers: isFreeForSubscribers ?? true,
        isPublished: !scheduledAt,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        goalAmount,
        goalTitle,
      })
      .returning();

    // Add media
    if (mediaIds && mediaIds.length > 0) {
      await db.insert(postMediaTable).values(
        mediaIds.map((mediaId: string, idx: number) => ({
          postId: post.id,
          mediaId,
          sortOrder: idx,
        }))
      );
    }

    // Add poll options
    if (postType === "poll" && pollOptions && pollOptions.length > 0) {
      await db.insert(pollOptionsTable).values(
        pollOptions.map((text: string, idx: number) => ({
          postId: post.id,
          text,
          sortOrder: idx,
        }))
      );
    }

    const enriched = await enrichPost(post, user.id);
    res.status(201).json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error creating post");
    res.status(500).json({ error: "Failed to create post" });
  }
});

// Get single post
router.get("/posts/:postId", optionalAuth, async (req, res) => {
  try {
    const currentUser = getUser(req);
    const { postId } = req.params;

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const enriched = await enrichPost(post, currentUser?.id);
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error getting post");
    res.status(500).json({ error: "Failed to get post" });
  }
});

// Update post
router.put("/posts/:postId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;
    const { text, isPpv, ppvPriceWld } = req.body;

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post || post.creatorId !== user.id) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const [updated] = await db
      .update(postsTable)
      .set({ text, isPpv, ppvPriceWld, updatedAt: new Date() })
      .where(eq(postsTable.id, postId))
      .returning();

    const enriched = await enrichPost(updated, user.id);
    res.json(enriched);
  } catch (err) {
    req.log.error({ err }, "Error updating post");
    res.status(500).json({ error: "Failed to update post" });
  }
});

// Delete post
router.delete("/posts/:postId", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;

    const [post] = await db.select().from(postsTable).where(eq(postsTable.id, postId)).limit(1);
    if (!post || post.creatorId !== user.id) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    await db.delete(postsTable).where(eq(postsTable.id, postId));
    res.json({ success: true, message: "Post deleted" });
  } catch (err) {
    req.log.error({ err }, "Error deleting post");
    res.status(500).json({ error: "Failed to delete post" });
  }
});

// Like post
router.post("/posts/:postId/like", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;

    const [existing] = await db.select().from(likesTable)
      .where(and(eq(likesTable.postId, postId), eq(likesTable.userId, user.id)))
      .limit(1);

    if (existing) {
      await db.delete(likesTable).where(eq(likesTable.id, existing.id));
      await db.update(postsTable).set({ likeCount: sql`like_count - 1` }).where(eq(postsTable.id, postId));
      res.json({ liked: false, likeCount: 0 });
    } else {
      await db.insert(likesTable).values({ postId, userId: user.id });
      await db.update(postsTable).set({ likeCount: sql`like_count + 1` }).where(eq(postsTable.id, postId));
      res.json({ liked: true, likeCount: 1 });
    }
  } catch (err) {
    req.log.error({ err }, "Error liking post");
    res.status(500).json({ error: "Failed to like post" });
  }
});

// Bookmark post
router.post("/posts/:postId/bookmark", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;

    const [existing] = await db.select().from(bookmarksTable)
      .where(and(eq(bookmarksTable.postId, postId), eq(bookmarksTable.userId, user.id)))
      .limit(1);

    if (existing) {
      await db.delete(bookmarksTable).where(eq(bookmarksTable.id, existing.id));
      res.json({ bookmarked: false });
    } else {
      await db.insert(bookmarksTable).values({ postId, userId: user.id });
      res.json({ bookmarked: true });
    }
  } catch (err) {
    req.log.error({ err }, "Error bookmarking post");
    res.status(500).json({ error: "Failed to bookmark post" });
  }
});

// Get comments
router.get("/posts/:postId/comments", async (req, res) => {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page as string || "1");
    const limit = 20;
    const offset = (page - 1) * limit;

    const comments = await db
      .select({ comment: commentsTable, user: usersTable })
      .from(commentsTable)
      .innerJoin(usersTable, eq(commentsTable.userId, usersTable.id))
      .where(eq(commentsTable.postId, postId))
      .orderBy(desc(commentsTable.createdAt))
      .limit(limit)
      .offset(offset);

    const total = await db.execute(sql`SELECT COUNT(*) as count FROM comments WHERE post_id = ${postId}`);

    res.json({
      comments: comments.map(({ comment, user }) => ({
        id: comment.id,
        postId: comment.postId,
        userId: comment.userId,
        user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
        text: comment.text,
        createdAt: comment.createdAt,
      })),
      total: Number(total.rows[0]?.count || 0),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting comments");
    res.status(500).json({ error: "Failed to get comments" });
  }
});

// Add comment
router.post("/posts/:postId/comments", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;
    const { text } = req.body;

    if (!text?.trim()) {
      res.status(400).json({ error: "Comment text required" });
      return;
    }

    const [comment] = await db
      .insert(commentsTable)
      .values({ postId, userId: user.id, text: text.trim() })
      .returning();

    await db.update(postsTable).set({ commentCount: sql`comment_count + 1` }).where(eq(postsTable.id, postId));

    res.status(201).json({
      id: comment.id,
      postId: comment.postId,
      userId: comment.userId,
      user: { id: user.id, username: user.username, displayName: user.displayName, avatarUrl: user.avatarUrl },
      text: comment.text,
      createdAt: comment.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error adding comment");
    res.status(500).json({ error: "Failed to add comment" });
  }
});

// Get bookmarks
router.get("/posts/bookmarks", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;

    const bookmarkedPostIds = await db
      .select({ postId: bookmarksTable.postId })
      .from(bookmarksTable)
      .where(eq(bookmarksTable.userId, user.id))
      .orderBy(desc(bookmarksTable.createdAt));

    const posts = await db
      .select()
      .from(postsTable)
      .where(inArray(postsTable.id, bookmarkedPostIds.map(b => b.postId)));

    const enriched = await Promise.all(posts.map(p => enrichPost(p, user.id)));

    res.json({
      posts: enriched,
      total: enriched.length,
      page: 1,
      hasMore: false,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting bookmarks");
    res.status(500).json({ error: "Failed to get bookmarks" });
  }
});

// Get stories
router.get("/stories", optionalAuth, async (req, res) => {
  try {
    const currentUser = getUser(req);
    const now = new Date();

    const stories = await db
      .select({ story: storiesTable, creator: usersTable })
      .from(storiesTable)
      .innerJoin(usersTable, eq(storiesTable.creatorId, usersTable.id))
      .where(sql`${storiesTable.expiresAt} > ${now}`)
      .orderBy(desc(storiesTable.createdAt))
      .limit(50);

    res.json({
      stories: stories.map(({ story, creator }) => ({
        id: story.id,
        creatorId: story.creatorId,
        creator: { id: creator.id, username: creator.username, displayName: creator.displayName, avatarUrl: creator.avatarUrl },
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        isPpv: story.isPpv,
        ppvPriceWld: story.ppvPriceWld,
        isUnlocked: !story.isPpv,
        viewCount: story.viewCount,
        expiresAt: story.expiresAt,
        createdAt: story.createdAt,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Error getting stories");
    res.status(500).json({ error: "Failed to get stories" });
  }
});

// Create story
router.post("/stories", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { mediaId, isPpv, ppvPriceWld } = req.body;

    if (!mediaId) {
      res.status(400).json({ error: "Media ID required" });
      return;
    }

    const [media] = await db.select().from(mediaTable).where(eq(mediaTable.id, mediaId)).limit(1);
    if (!media) {
      res.status(404).json({ error: "Media not found" });
      return;
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const [story] = await db
      .insert(storiesTable)
      .values({
        creatorId: user.id,
        mediaId,
        mediaUrl: media.url,
        mediaType: media.mediaType,
        isPpv: isPpv || false,
        ppvPriceWld: isPpv ? ppvPriceWld : null,
        expiresAt,
      })
      .returning();

    res.status(201).json({
      id: story.id,
      creatorId: story.creatorId,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      isPpv: story.isPpv,
      ppvPriceWld: story.ppvPriceWld,
      isUnlocked: !story.isPpv,
      viewCount: story.viewCount,
      expiresAt: story.expiresAt,
      createdAt: story.createdAt,
    });
  } catch (err) {
    req.log.error({ err }, "Error creating story");
    res.status(500).json({ error: "Failed to create story" });
  }
});

// Vote on poll
router.post("/polls/:postId/vote", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { postId } = req.params;
    const { optionId } = req.body;

    // Check already voted
    const [existing] = await db.select().from(pollVotesTable)
      .where(and(eq(pollVotesTable.postId, postId), eq(pollVotesTable.userId, user.id)))
      .limit(1);

    if (existing) {
      res.status(400).json({ error: "Already voted" });
      return;
    }

    await db.insert(pollVotesTable).values({ postId, optionId, userId: user.id });
    await db.update(pollOptionsTable).set({ voteCount: sql`vote_count + 1` }).where(eq(pollOptionsTable.id, optionId));

    const options = await db.select().from(pollOptionsTable).where(eq(pollOptionsTable.postId, postId));

    res.json({ options, userVotedOptionId: optionId });
  } catch (err) {
    req.log.error({ err }, "Error voting on poll");
    res.status(500).json({ error: "Failed to vote" });
  }
});

// Get upload URL
router.post("/media/upload-url", requireAuth, async (req, res) => {
  try {
    const user = getUser(req)!;
    const { filename, contentType, folder = "posts" } = req.body;

    // In production: use S3/CloudFront presigned URLs
    // For now: return a simulated upload URL
    const mediaId = crypto.randomUUID();
    const ext = filename.split(".").pop();
    const key = `${folder}/${user.id}/${mediaId}.${ext}`;
    const publicUrl = `${process.env.CDN_BASE_URL || "https://storage.hfans.app"}/${key}`;

    // Pre-create media record
    await db.insert(mediaTable).values({
      id: mediaId,
      userId: user.id,
      url: publicUrl,
      mediaType: contentType.startsWith("video") ? "video" : contentType.startsWith("audio") ? "audio" : "image",
      filename,
      folder,
    });

    res.json({
      uploadUrl: `${process.env.API_BASE_URL || ""}/api/media/upload/${mediaId}`,
      mediaId,
      publicUrl,
    });
  } catch (err) {
    req.log.error({ err }, "Error getting upload URL");
    res.status(500).json({ error: "Failed to get upload URL" });
  }
});

export default router;
