import { pgTable, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const messagesTable = pgTable("messages", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  senderId: text("sender_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  receiverId: text("receiver_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  text: text("text"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  isPpv: boolean("is_ppv").default(false).notNull(),
  ppvPriceWld: text("ppv_price_wld"),
  isUnlocked: boolean("is_unlocked").default(false).notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  isMassDm: boolean("is_mass_dm").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fanListsTable = pgTable("fan_lists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const fanListMembersTable = pgTable("fan_list_members", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  listId: text("list_id").notNull().references(() => fanListsTable.id, { onDelete: "cascade" }),
  fanId: text("fan_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({ id: true, createdAt: true });
export type Message = typeof messagesTable.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type FanList = typeof fanListsTable.$inferSelect;
