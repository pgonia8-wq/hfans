import { pgTable, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoleEnum = pgEnum("user_role", ["fan", "creator", "admin"]);
export const creatorStatusEnum = pgEnum("creator_status", ["pending", "approved", "rejected", "suspended"]);

export const usersTable = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").unique().notNull(),
  displayName: text("display_name"),
  bio: text("bio"),
  avatarUrl: text("avatar_url"),
  bannerUrl: text("banner_url"),
  walletAddress: text("wallet_address").unique(),
  nullifierHash: text("nullifier_hash").unique(),
  role: userRoleEnum("role").default("fan").notNull(),
  isWorldIdVerified: boolean("is_world_id_verified").default(false).notNull(),
  worldIdCredentialType: text("world_id_credential_type"),
  twitterHandle: text("twitter_handle"),
  instagramHandle: text("instagram_handle"),
  tiktokHandle: text("tiktok_handle"),
  spotifyUrl: text("spotify_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creatorProfilesTable = pgTable("creator_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  // Base price for the default subscription tier
  subscriptionPriceWld: text("subscription_price_wld").default("1.0").notNull(),
  status: creatorStatusEnum("status").default("approved").notNull(),
  approvedAt: timestamp("approved_at"),
  totalEarningsWld: text("total_earnings_wld").default("0").notNull(),
  pendingBalanceWld: text("pending_balance_wld").default("0").notNull(),
  welcomeMessageEnabled: boolean("welcome_message_enabled").default(true).notNull(),
  welcomeMessageText: text("welcome_message_text"),
  commentsEnabled: boolean("comments_enabled").default(true).notNull(),
  tipsEnabled: boolean("tips_enabled").default(true).notNull(),
  // Price for paid DMs (null = free, "0" = messages disabled)
  paidDmPriceWld: text("paid_dm_price_wld"),
  // Minimum tip amount in WLD
  minTipWld: text("min_tip_wld").default("0.1").notNull(),
  // Free trial days for new subscribers
  freeTrialDays: integer("free_trial_days").default(0).notNull(),
  watermarkEnabled: boolean("watermark_enabled").default(false).notNull(),
  showSubscriberCount: boolean("show_subscriber_count").default(true).notNull(),
  showPostCount: boolean("show_post_count").default(true).notNull(),
  contentCategories: text("content_categories").array(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCreatorProfileSchema = createInsertSchema(creatorProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type User = typeof usersTable.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type CreatorProfile = typeof creatorProfilesTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
