import { pgTable, text, boolean, timestamp, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const livestreamStatusEnum = pgEnum("livestream_status", ["scheduled", "live", "ended"]);

export const livestreamsTable = pgTable("livestreams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  roomName: text("room_name").unique(),
  status: livestreamStatusEnum("status").default("scheduled").notNull(),
  isPpv: boolean("is_ppv").default(false).notNull(),
  ppvPriceWld: text("ppv_price_wld"),
  tipMenuItems: jsonb("tip_menu_items").$type<Array<{ label: string; amountWld: string }>>(),
  viewerCount: integer("viewer_count").default(0).notNull(),
  peakViewers: integer("peak_viewers").default(0).notNull(),
  totalTipsWld: text("total_tips_wld").default("0").notNull(),
  recordingUrl: text("recording_url"),
  thumbnailUrl: text("thumbnail_url"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const livestreamViewersTable = pgTable("livestream_viewers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  streamId: text("stream_id").notNull().references(() => livestreamsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => usersTable.id),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
});

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  isRead: boolean("is_read").default(false).notNull(),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLivestreamSchema = createInsertSchema(livestreamsTable).omit({ id: true, createdAt: true });
export type Livestream = typeof livestreamsTable.$inferSelect;
export type InsertLivestream = z.infer<typeof insertLivestreamSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
