import { useEffect, useState } from "react";
import { Check, Crown, ShieldCheck, Sparkles } from "lucide-react";

type SubscriptionPlan = {
  id: number;
  slug: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: "monthly" | "quarterly" | "yearly" | "lifetime";
  trialDays: number;
  features: string[];
};

export default function BillingPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  useEffect(() => {
    void fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("/api/subscriptions/plans", {
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Unable to load subscription plans");
      }

      const data = (await res.json()) as SubscriptionPlan[];
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(planId: number) {
    try {
      setProcessingId(planId);
      setError(null);

      const res = await fetch("/api/subscriptions/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          planId,
          returnUrl: `${window.location.origin}/billing/success`,
          cancelUrl: `${window.location.origin}/billing/cancel`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Could not start checkout");
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment checkout failed");
    } finally {
      setProcessingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#f4f1e6] px-4 py-10 text-[#183c37]">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#d7e7dd] px-4 py-2 text-xs font-bold tracking-[0.2em] text-[#1c584d] uppercase">
            <Crown size={14} />
            Premium access
          </div>

          <h1 className="font-display text-4xl font-black tracking-tight text-[#183c37]">
            Choose your subscription
          </h1>

          <p className="mt-3 text-base text-[#526a65]">
            Unlock priority matching, advanced profile visibility, and exclusive community tools.
          </p>
        </div>

        {error && (
          <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-[#f1c7b9] bg-[#fff1ec] p-4 text-sm text-[#7c4136]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-80 animate-pulse rounded-[24px] border border-[#e4dfd0] bg-white/60"
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const isPopular = plan.slug === "pro";
              const isProcessing = processingId === plan.id;

              return (
                <div
                  key={plan.id}
                  className={[
                    "rounded-[28px] border p-6 shadow-sm",
                    isPopular
                      ? "border-[#205c50] bg-[#1e514a] text-white shadow-lg"
                      : "border-[#ddd5c4] bg-[#fffdf8] text-[#183c37]",
                  ].join(" ")}
                >
                  <div className="mb-5 flex items-center justify-between">
                    <div>
                      <p
                        className={
                          isPopular
                            ? "text-xs font-bold tracking-[0.2em] text-[#f0d7a0] uppercase"
                            : "text-xs font-bold tracking-[0.2em] text-[#768b84] uppercase"
                        }
                      >
                        {plan.slug}
                      </p>
                      <h2 className="mt-2 text-2xl font-black">{plan.name}</h2>
                    </div>

                    {isPopular && (
                      <div className="rounded-full bg-[#f4d290] px-2.5 py-1 text-[10px] font-black text-[#204c45]">
                        Popular
                      </div>
                    )}
                  </div>

                  <div className="mb-5 flex items-end gap-2">
                    <span className="text-4xl font-black">{plan.price}</span>
                    <span
                      className={
                        isPopular ? "text-sm text-[#f3ebdd]" : "text-sm text-[#617269]"
                      }
                    >
                      {plan.currency}
                    </span>
                  </div>

                  <p
                    className={
                      isPopular ? "mb-5 text-sm text-[#dfebdf]" : "mb-5 text-sm text-[#5e726d]"
                    }
                  >
                    {plan.description}
                  </p>

                  <div
                    className={
                      isPopular
                        ? "mb-6 space-y-3 text-sm text-[#edf4ef]"
                        : "mb-6 space-y-3 text-sm text-[#335552]"
                    }
                  >
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div
                          className={
                            isPopular ? "mt-0.5 text-[#f0d7a0]" : "mt-0.5 text-[#205c50]"
                          }
                        >
                          <Check size={16} />
                        </div>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {plan.trialDays > 0 && (
                    <div
                      className={
                        isPopular ? "mb-5 text-xs text-[#f7e9cd]" : "mb-5 text-xs text-[#59756d]"
                      }
                    >
                      {plan.trialDays} day free trial
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => startCheckout(plan.id)}
                    disabled={isProcessing}
                    className={[
                      "flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition",
                      isPopular
                        ? "bg-[#f2c47e] text-[#173d39] hover:bg-[#f6d79a]"
                        : "bg-[#205c50] text-white hover:bg-[#1a4a45]",
                      isProcessing ? "cursor-not-allowed opacity-70" : "",
                    ].join(" ")}
                  >
                    {isProcessing ? "Preparing checkout..." : `Subscribe to ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 rounded-[24px] border border-[#d9d3c5] bg-[#f9f5ee] p-5 text-sm text-[#5b706b]">
          <div className="mb-3 flex items-center gap-2 font-bold text-[#183c37]">
            <ShieldCheck size={16} className="text-[#1c584d]" />
            Safe and flexible billing
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2">
              <Sparkles size={14} className="text-[#d89f68]" /> Secure payment checkout
            </span>
            <span className="inline-flex items-center gap-2">
              <Check size={14} className="text-[#2f6a57]" /> Verified payments only
            </span>
            <span className="inline-flex items-center gap-2">
              <Crown size={14} className="text-[#c89c3d]" /> Manual renewal per cycle
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
