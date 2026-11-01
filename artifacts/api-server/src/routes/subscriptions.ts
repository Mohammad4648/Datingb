import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  paymentOrdersTable,
  profilesTable,
  subscriptionPlansTable,
  subscriptionPlanSummarySchema,
  subscriptionWebhookSchema,
  userSubscriptionsTable,
} from "@workspace/db";
import { getCurrentProfile } from "../lib/social";
import {
  createBinancePayOrder,
  getBinanceCheckoutRedirectUrl,
  verifyBinanceWebhook,
} from "../lib/binancePay";

const router: IRouter = Router();

const subscriptionPlanIdSchema = z.object({
  planId: z.coerce.number().int().positive(),
});

const checkoutBodySchema = z.object({
  planId: z.number().int().positive(),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

router.get("/subscriptions/plans", async (_req: Request, res: Response): Promise<void> => {
  const plans = await db
    .select()
    .from(subscriptionPlansTable)
    .where(eq(subscriptionPlansTable.status, "active"))
    .orderBy(desc(subscriptionPlansTable.price));

  res.json(
    plans.map((plan) => ({
      id: plan.id,
      slug: plan.slug,
      name: plan.name,
      description: plan.description,
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      trialDays: plan.trialDays,
      features: Array.isArray(plan.features) ? plan.features : [],
    })),
  );
});

router.get("/subscriptions/me", async (req: Request, res: Response): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;

  const [subscription] = await db
    .select({
      id: userSubscriptionsTable.id,
      status: userSubscriptionsTable.status,
      currentPeriodStart: userSubscriptionsTable.currentPeriodStart,
      currentPeriodEnd: userSubscriptionsTable.currentPeriodEnd,
      cancelAtPeriodEnd: userSubscriptionsTable.cancelAtPeriodEnd,
      plan: subscriptionPlansTable,
    })
    .from(userSubscriptionsTable)
    .innerJoin(subscriptionPlansTable, eq(userSubscriptionsTable.planId, subscriptionPlansTable.id))
    .where(eq(userSubscriptionsTable.profileId, profile.id))
    .orderBy(desc(userSubscriptionsTable.createdAt))
    .limit(1);

  if (!subscription) {
    res.status(404).json({ error: "No subscription found" });
    return;
  }

  res.json({
    id: subscription.id,
    status: subscription.status,
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    plan: subscriptionPlanSummarySchema.parse({
      id: subscription.plan.id,
      slug: subscription.plan.slug,
      name: subscription.plan.name,
      description: subscription.plan.description,
      price: subscription.plan.price,
      currency: subscription.plan.currency,
      interval: subscription.plan.interval,
      features: Array.isArray(subscription.plan.features) ? subscription.plan.features : [],
      trialDays: subscription.plan.trialDays,
    }),
  });
});

router.post("/subscriptions/checkout", async (req: Request, res: Response): Promise<void> => {
  const profile = await getCurrentProfile(req, res);
  if (!profile) return;

  const parsed = checkoutBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.id, parsed.data.planId), eq(subscriptionPlansTable.status, "active")))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  const orderId = `sub_${profile.id}_${plan.id}_${Date.now()}`;

  try {
    const checkout = await createBinancePayOrder({
      orderId,
      amount: plan.price,
      currency: plan.currency,
      description: `${plan.name} subscription`,
      clientOrderId: `user-${profile.id}`,
      returnUrl: parsed.data.returnUrl ?? `${process.env.APP_URL ?? "http://localhost:3000"}/billing/success?plan=${plan.slug}`,
      cancelUrl: parsed.data.cancelUrl ?? `${process.env.APP_URL ?? "http://localhost:3000"}/billing/cancel?plan=${plan.slug}`,
      metadata: {
        profileId: profile.id,
        planId: plan.id,
        planSlug: plan.slug,
        interval: plan.interval,
      },
    });

    const checkoutUrl = getBinanceCheckoutRedirectUrl(checkout);
    if (!checkoutUrl) {
      res.status(502).json({ error: "Payment provider did not return a checkout URL" });
      return;
    }

    await db.insert(paymentOrdersTable).values({
      profileId: profile.id,
      planId: plan.id,
      externalOrderId: orderId,
      checkoutUrl,
      amount: plan.price,
      currency: plan.currency,
      status: "pending",
      provider: "binance-pay",
      metadata: {
        orderId,
        planId: plan.id,
        profileId: profile.id,
        checkoutUrl,
      },
    });

    res.status(201).json({
      orderId,
      checkoutUrl,
      provider: "binance-pay",
      status: "pending",
    });
  } catch (error) {
    req.log.error({ err: error }, "Error creating Binance subscription checkout");
    res.status(502).json({ error: "Failed to create payment checkout" });
  }
});

router.get("/subscriptions/plans/:planId", async (req: Request, res: Response): Promise<void> => {
  const params = subscriptionPlanIdSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [plan] = await db
    .select()
    .from(subscriptionPlansTable)
    .where(and(eq(subscriptionPlansTable.id, params.data.planId), eq(subscriptionPlansTable.status, "active")))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "Plan not found" });
    return;
  }

  res.json({
    id: plan.id,
    slug: plan.slug,
    name: plan.name,
    description: plan.description,
    price: plan.price,
    currency: plan.currency,
    interval: plan.interval,
    features: Array.isArray(plan.features) ? plan.features : [],
    trialDays: plan.trialDays,
  });
});

router.post("/subscriptions/webhook", async (req: Request, res: Response): Promise<void> => {
  const signature = req.headers["x-binancepay-signature"] as string | undefined;
  const rawBody = JSON.stringify(req.body ?? {});

  const isValid = verifyBinanceWebhook(rawBody, signature);
  if (!isValid) {
    res.status(401).json({ error: "Invalid webhook signature" });
    return;
  }

  const parsed = subscriptionWebhookSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const order = await db
    .select()
    .from(paymentOrdersTable)
    .where(eq(paymentOrdersTable.externalOrderId, parsed.data.orderId))
    .limit(1);

  if (!order[0]) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const status = parsed.data.status === "success" ? "paid" : parsed.data.status === "failed" ? "failed" : "pending";

  await db
    .update(paymentOrdersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentOrdersTable.id, order[0].id));

  if (status === "paid") {
    const [plan] = await db
      .select()
      .from(subscriptionPlansTable)
      .where(eq(subscriptionPlansTable.id, order[0].planId))
      .limit(1);

    if (plan) {
      const endDate = new Date();
      endDate.setUTCMonth(endDate.getUTCMonth() + 1);

      await db
        .insert(userSubscriptionsTable)
        .values({
          profileId: order[0].profileId,
          planId: plan.id,
          status: "paid",
          startedAt: new Date(),
          currentPeriodStart: new Date(),
          currentPeriodEnd: endDate,
          externalCustomerId: String(order[0].profileId),
          externalSubscriptionId: `sub_${order[0].id}`,
        })
        .onConflictDoUpdate({
          target: [userSubscriptionsTable.profileId, userSubscriptionsTable.planId],
          set: {
            status: "paid",
            currentPeriodStart: new Date(),
            currentPeriodEnd: endDate,
            updatedAt: new Date(),
          },
        });
    }
  }

  res.status(200).json({ success: true });
});

export default router;
