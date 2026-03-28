import { pgTable, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active", "expired", "cancelled", "trial",
]);
export const paymentTypeEnum = pgEnum("payment_type", [
  "subscription", "ppv", "tip", "payout", "custom_request", "paid_message",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending", "completed", "failed", "refunded",
]);
export const discountTypeEnum = pgEnum("discount_type", ["percent", "fixed_wld"]);
export const paymentCurrencyEnum = pgEnum("payment_currency", ["WLD", "USD"]);

// ─── Subscription Tiers ────────────────────────────────────────────────────────
// Each creator can define multiple tiers (e.g. Fan $5, VIP $15, Ultra $30)
export const subscriptionTiersTable = pgTable("subscription_tiers", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  priceWld: text("price_wld").notNull(),
  // List of benefit strings shown to prospective subscribers
  benefits: text("benefits").array().default([]).notNull(),
  // Free trial period in days (0 = no trial)
  trialDays: integer("trial_days").default(0).notNull(),
  // Bundle discounts (percentage off base monthly price)
  bundle3moDiscountPct: integer("bundle_3mo_discount_pct").default(0).notNull(),
  bundle6moDiscountPct: integer("bundle_6mo_discount_pct").default(0).notNull(),
  bundle12moDiscountPct: integer("bundle_12mo_discount_pct").default(0).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Promo Codes ──────────────────────────────────────────────────────────────
export const promoCodesTable = pgTable("promo_codes", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  // null = platform-wide promo, otherwise creator-specific
  creatorId: text("creator_id").references(() => usersTable.id, { onDelete: "cascade" }),
  code: text("code").unique().notNull(),
  discountType: discountTypeEnum("discount_type").notNull(),
  // if percent: "20" (20%), if fixed_wld: "0.5" (0.5 WLD off)
  discountValue: text("discount_value").notNull(),
  maxUses: integer("max_uses"),
  usesCount: integer("uses_count").default(0).notNull(),
  // null = applies to all tiers
  tierId: text("tier_id"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Subscriptions ────────────────────────────────────────────────────────────
export const subscriptionsTable = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fanId: text("fan_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tierId: text("tier_id"),
  priceWld: text("price_wld").notNull(),
  bundleMonths: integer("bundle_months").default(1).notNull(),
  promoCodeId: text("promo_code_id"),
  discountAppliedPct: integer("discount_applied_pct").default(0).notNull(),
  status: subscriptionStatusEnum("status").default("active").notNull(),
  autoRenew: boolean("auto_renew").default(true).notNull(),
  trialEndsAt: timestamp("trial_ends_at"),
  startedAt: timestamp("started_at"),
  expiresAt: timestamp("expires_at"),
  renewalReminderSentAt: timestamp("renewal_reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Payments ─────────────────────────────────────────────────────────────────
export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  referenceId: text("reference_id").unique().notNull(),
  payerId: text("payer_id").references(() => usersTable.id),
  recipientId: text("recipient_id").references(() => usersTable.id),
  type: paymentTypeEnum("type").notNull(),
  currency: paymentCurrencyEnum("currency").default("WLD").notNull(),
  amountWld: text("amount_wld").notNull(),
  amountUsd: text("amount_usd"),
  platformFeeWld: text("platform_fee_wld").notNull(),
  creatorAmountWld: text("creator_amount_wld").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  description: text("description"),
  contentId: text("content_id"),
  subscriptionId: text("subscription_id"),
  transactionId: text("transaction_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Payouts ──────────────────────────────────────────────────────────────────
export const payoutsTable = pgTable("payouts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amountWld: text("amount_wld").notNull(),
  walletAddress: text("wallet_address").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  transactionId: text("transaction_id"),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSubscriptionTierSchema = createInsertSchema(subscriptionTiersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPromoCodeSchema = createInsertSchema(promoCodesTable).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type SubscriptionTier = typeof subscriptionTiersTable.$inferSelect;
export type PromoCode = typeof promoCodesTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type Payment = typeof paymentsTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
