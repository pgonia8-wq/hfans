import { pgTable, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const postTypeEnum = pgEnum("post_type", ["text", "photo", "video", "poll", "quiz"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video", "audio"]);

export const mediaTable = pgTable("media", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  thumbnailUrl: text("thumbnail_url"),
  blurUrl: text("blur_url"),
  mediaType: mediaTypeEnum("media_type").notNull(),
  filename: text("filename"),
  size: integer("size"),
  duration: integer("duration"),
  folder: text("folder"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const postsTable = pgTable("posts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text"),
  postType: postTypeEnum("post_type").default("text").notNull(),
  isPpv: boolean("is_ppv").default(false).notNull(),
  ppvPriceWld: text("ppv_price_wld"),
  isFreeForSubscribers: boolean("is_free_for_subscribers").default(true).notNull(),
  isPublished: boolean("is_published").default(true).notNull(),
  scheduledAt: timestamp("scheduled_at"),
  goalAmount: text("goal_amount"),
  goalCurrent: text("goal_current").default("0"),
  goalTitle: text("goal_title"),
  viewCount: integer("view_count").default(0).notNull(),
  likeCount: integer("like_count").default(0).notNull(),
  commentCount: integer("comment_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const postMediaTable = pgTable("post_media", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  mediaId: text("media_id").notNull().references(() => mediaTable.id),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const pollOptionsTable = pgTable("poll_options", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  voteCount: integer("vote_count").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const pollVotesTable = pgTable("poll_votes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  optionId: text("option_id").notNull().references(() => pollOptionsTable.id),
  userId: text("user_id").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const likesTable = pgTable("likes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const bookmarksTable = pgTable("bookmarks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const commentsTable = pgTable("comments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  postId: text("post_id").notNull().references(() => postsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const storiesTable = pgTable("stories", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  mediaId: text("media_id").references(() => mediaTable.id),
  mediaUrl: text("media_url"),
  mediaType: mediaTypeEnum("media_type").default("image").notNull(),
  isPpv: boolean("is_ppv").default(false).notNull(),
  ppvPriceWld: text("ppv_price_wld"),
  viewCount: integer("view_count").default(0).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const ppvUnlocksTable = pgTable("ppv_unlocks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  contentId: text("content_id").notNull(),
  contentType: text("content_type").notNull(),
  paymentId: text("payment_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type Post = typeof postsTable.$inferSelect;
export type InsertPost = z.infer<typeof insertPostSchema>;
export type Media = typeof mediaTable.$inferSelect;
export type Story = typeof storiesTable.$inferSelect;
export type Comment = typeof commentsTable.$inferSelect;
