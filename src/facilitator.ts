import { request } from 'undici';
import type { Env } from './config.js';

export interface PaymentRequirements {
  scheme: 'exact';
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra?: Record<string, unknown>;
}

export interface VerifyResult {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

export interface SettleResult {
  success: boolean;
  transaction?: string;
  network?: string;
  payer?: string;
  errorReason?: string;
}

function usdToAtomicUSDC(amountUsd: number): string {
  return BigInt(Math.round(amountUsd * 1_000_000)).toString();
}

export function buildPaymentRequirements(
  env: Env,
  route: string,
  amountUsd: number,
  description: string
): PaymentRequirements {
  return {
    scheme: 'exact',
    network: env.X402_CHAIN,
    maxAmountRequired: usdToAtomicUSDC(amountUsd),
    resource: route,
    description,
    mimeType: 'application/json',
    payTo: env.X402_PAY_TO_ADDRESS,
    maxTimeoutSeconds: 60,
    asset: env.X402_ASSET,
  };
}

function authHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET) {
    const token = Buffer.from(`${env.CDP_API_KEY_ID}:${env.CDP_API_KEY_SECRET}`).toString('base64');
    headers.authorization = `Basic ${token}`;
  }
  return headers;
}

export async function verifyPayment(
  env: Env,
  paymentPayload: string,
  requirements: PaymentRequirements
): Promise<VerifyResult> {
  const res = await request(`${env.CDP_FACILITATOR_URL}/verify`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: requirements,
    }),
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    return { isValid: false, invalidReason: `facilitator ${res.statusCode}: ${body}` };
  }
  const data = (await res.body.json()) as VerifyResult;
  return data;
}

export async function settlePayment(
  env: Env,
  paymentPayload: string,
  requirements: PaymentRequirements
): Promise<SettleResult> {
  const res = await request(`${env.CDP_FACILITATOR_URL}/settle`, {
    method: 'POST',
    headers: authHeaders(env),
    body: JSON.stringify({
      paymentPayload,
      paymentRequirements: requirements,
    }),
  });
  if (res.statusCode >= 400) {
    const body = await res.body.text();
    return { success: false, errorReason: `facilitator ${res.statusCode}: ${body}` };
  }
  return (await res.body.json()) as SettleResult;
}
