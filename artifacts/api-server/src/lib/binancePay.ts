import { createHmac, timingSafeEqual } from "crypto";

export const BINANCE_PAY_API_BASE = process.env.BINANCE_PAY_API_BASE ?? "https://api.binance.com";
export const BINANCE_PAY_MERCHANT_ID = process.env.BINANCE_PAY_MERCHANT_ID ?? "";
export const BINANCE_PAY_API_KEY = process.env.BINANCE_PAY_API_KEY ?? "";
export const BINANCE_PAY_SECRET_KEY = process.env.BINANCE_PAY_SECRET_KEY ?? "";
export const BINANCE_PAY_WEBHOOK_SECRET = process.env.BINANCE_PAY_WEBHOOK_SECRET ?? "";

export type BinancePayOrderRequest = {
  orderId: string;
  amount: number;
  currency: string;
  clientOrderId?: string;
  description: string;
  returnUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, unknown>;
};

export type BinancePayCreateOrderResponse = {
  status: string;
  orderId?: string;
  checkoutUrl?: string;
  paymentUrl?: string;
  qrCodeUrl?: string;
  provider?: string;
  data?: Record<string, unknown>;
  message?: string;
};

function getSignature(payload: string): string {
  if (!BINANCE_PAY_SECRET_KEY) {
    throw new Error("BINANCE_PAY_SECRET_KEY is not configured");
  }
  return createHmac("sha256", BINANCE_PAY_SECRET_KEY).update(payload).digest("hex");
}

export function verifyBinanceWebhook(rawBody: string, signature: string | undefined): boolean {
  if (!BINANCE_PAY_WEBHOOK_SECRET) {
    return false;
  }
  if (!signature) {
    return false;
  }

  const expected = createHmac("sha256", BINANCE_PAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function createBinancePayOrder({
  orderId,
  amount,
  currency,
  clientOrderId,
  description,
  returnUrl,
  cancelUrl,
  metadata,
}: BinancePayOrderRequest): Promise<BinancePayCreateOrderResponse> {
  if (!BINANCE_PAY_MERCHANT_ID || !BINANCE_PAY_API_KEY || !BINANCE_PAY_SECRET_KEY) {
    throw new Error("Binance Pay merchant credentials are not configured");
  }

  const payload = {
    merchantId: BINANCE_PAY_MERCHANT_ID,
    orderId,
    amount,
    currency,
    clientOrderId,
    description,
    returnUrl,
    cancelUrl,
    metadata,
  };

  const response = await fetch(`${BINANCE_PAY_API_BASE}/api/v3/order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MBX-APIKEY": BINANCE_PAY_API_KEY,
      "X-BinancePay-Nonce": `${Date.now()}`,
      "X-BinancePay-Signature": getSignature(JSON.stringify(payload)),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Binance Pay checkout request failed: ${response.status} ${details}`);
  }

  const data = (await response.json()) as Record<string, unknown>;

  return {
    status: String(data.status ?? "pending"),
    orderId: String(data.orderId ?? orderId),
    checkoutUrl: typeof data.checkoutUrl === "string" ? data.checkoutUrl : undefined,
    paymentUrl: typeof data.paymentUrl === "string" ? data.paymentUrl : undefined,
    qrCodeUrl: typeof data.qrCodeUrl === "string" ? data.qrCodeUrl : undefined,
    provider: "binance-pay",
    data,
  };
}

export function getBinanceCheckoutRedirectUrl(order: BinancePayCreateOrderResponse): string | null {
  return order.checkoutUrl ?? order.paymentUrl ?? order.qrCodeUrl ?? null;
}

export function getWebHookVerificationRequired(): boolean {
  return Boolean(BINANCE_PAY_WEBHOOK_SECRET);
}
