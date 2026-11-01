import { sql } from "drizzle-orm";
import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { profilesTable } from "./social";

export const subscriptionPlanStatusEnum = pgEnum("subscription_plan_status", [
  "active",
  "inactive",
  "archived",
]);

export const subscriptionPlanIntervalEnum = pgEnum("subscription_plan_interval", [
  "monthly",
  "quarterly",
  "yearly",
  "lifetime",
]);

export const subscriptionPaymentStatusEnum = pgEnum("subscription_payment_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
]);

export const subscriptionPlansTable = pgTable(
  "subscription_plans",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    price: integer("price").notNull(),
    currency: text("currency").notNull().default("USD"),
    interval: subscriptionPlanIntervalEnum("interval").notNull(),
    trialDays: integer("trial_days").notNull().default(0),
    status: subscriptionPlanStatusEnum("status").notNull().default("active"),
    features: jsonb("features").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("subscription_plans_slug_idx").on(table.slug)],
);

export const userSubscriptionsTable = pgTable(
  "user_subscriptions",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlansTable.id, { onDelete: "restrict" }),
    status: subscriptionPaymentStatusEnum("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    externalCustomerId: text("external_customer_id"),
    externalSubscriptionId: text("external_subscription_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_subscriptions_profile_plan_unique").on(
      table.profileId,
      table.planId,
    ),
  ],
);

export const paymentOrdersTable = pgTable(
  "payment_orders",
  {
    id: serial("id").primaryKey(),
    profileId: integer("profile_id")
      .notNull()
      .references(() => profilesTable.id, { onDelete: "cascade" }),
    planId: integer("plan_id")
      .notNull()
      .references(() => subscriptionPlansTable.id, { onDelete: "restrict" }),
    externalOrderId: text("external_order_id").notNull(),
    checkoutUrl: text("checkout_url"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: subscriptionPaymentStatusEnum("status").notNull().default("pending"),
    provider: text("provider").notNull().default("binance-pay"),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("payment_orders_external_order_unique").on(table.externalOrderId)],
);

export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlansTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPaymentOrderSchema = createInsertSchema(paymentOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SubscriptionPlan = typeof subscriptionPlansTable.$inferSelect;
export type UserSubscription = typeof userSubscriptionsTable.$inferSelect;
export type PaymentOrder = typeof paymentOrdersTable.$inferSelect;
export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type InsertUserSubscription = z.infer<typeof insertUserSubscriptionSchema>;
export type InsertPaymentOrder = z.infer<typeof insertPaymentOrderSchema>;

export const defaultSubscriptionPlans = [
  {
    slug: "starter",
    name: "Starter",
    description: "Basic access for members",
    price: 990,
    currency: "USD",
    interval: "monthly",
    trialDays: 0,
    status: "active",
    features: ["Access to public communities", "Limited profile visibility"],
  },
  {
    slug: "pro",
    name: "Pro",
    description: "Priority access and premium listing",
    price: 2990,
    currency: "USD",
    interval: "monthly",
    trialDays: 7,
    status: "active",
    features: ["Everything in Starter", "Unlimited chat boosts", "Priority matching"],
  },
  {
    slug: "vip",
    name: "VIP",
    description: "Premium experience with top placement",
    price: 7990,
    currency: "USD",
    interval: "monthly",
    trialDays: 0,
    status: "active",
    features: ["Everything in Pro", "VIP profile spotlight", "Priority support"],
  },
] as const;

export type DefaultSubscriptionPlan = (typeof defaultSubscriptionPlans)[number];

export const subscriptionPlanSummarySchema = z.object({
  id: z.number(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  price: z.number(),
  currency: z.string(),
  interval: z.enum(["monthly", "quarterly", "yearly", "lifetime"]),
  features: z.array(z.string()),
  trialDays: z.number(),
});

export const subscriptionCheckoutRequestSchema = z.object({
  planId: z.number().int().positive(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const subscriptionWebhookSchema = z.object({
  provider: z.string().default("binance-pay"),
  orderId: z.string(),
  status: z.string(),
  signature: z.string().optional(),
  payload: z.record(z.any()).optional(),
});

export const parseSubscriptionStatus = (
  value: string,
): "pending" | "paid" | "failed" | "cancelled" | "expired" => {
  switch (value) {
    case "paid":
    case "pending":
    case "failed":
    case "cancelled":
    case "expired":
      return value;
    default:
      return "pending";
  }
};

export const normalizeSubscriptionPrice = (price: number): number =>
  Math.max(0, Math.round(price));

export const isSubscriptionActive = (status: string): boolean => status === "paid";

export const getSubscriptionRenewalDate = (
  startedAt: Date,
  interval: "monthly" | "quarterly" | "yearly" | "lifetime",
): Date => {
  const result = new Date(startedAt);
  switch (interval) {
    case "monthly":
      result.setUTCMonth(result.getUTCMonth() + 1);
      break;
    case "quarterly":
      result.setUTCMonth(result.getUTCMonth() + 3);
      break;
    case "yearly":
      result.setUTCFullYear(result.getUTCFullYear() + 1);
      break;
    case "lifetime":
      result.setUTCFullYear(result.getUTCFullYear() + 100);
      break;
  }
  return result;
};
