import { pgTable, text, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "expired", "cancelled"]);
export const paymentTypeEnum = pgEnum("payment_type", ["subscription", "ppv", "tip", "payout", "custom_request"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  fanId: text("fan_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  creatorId: text("creator_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  priceWld: text("price_wld").notNull(),
  status: subscriptionStatusEnum("status").default("active").notNull(),
  autoRenew: boolean("auto_renew").default(true).notNull(),
  startedAt: timestamp("started_at"),
  expiresAt: timestamp("expires_at"),
  renewalReminderSentAt: timestamp("renewal_reminder_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  referenceId: text("reference_id").unique().notNull(),
  payerId: text("payer_id").references(() => usersTable.id),
  recipientId: text("recipient_id").references(() => usersTable.id),
  type: paymentTypeEnum("type").notNull(),
  amountWld: text("amount_wld").notNull(),
  platformFeeWld: text("platform_fee_wld").notNull(),
  creatorAmountWld: text("creator_amount_wld").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  description: text("description"),
  contentId: text("content_id"),
  subscriptionId: text("subscription_id"),
  transactionId: text("transaction_id"),
  verifiedAt: timestamp("verified_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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

export const insertSubscriptionSchema = createInsertSchema(subscriptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Subscription = typeof subscriptionsTable.$inferSelect;
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
