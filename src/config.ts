import 'dotenv/config';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EnvSchema = z.object({
  X402_PAY_TO_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid ETH address'),
  X402_CHAIN: z.string().default('base'),
  X402_ASSET: z.string().default('USDC'),
  X402_NETWORK_VERSION: z.coerce.number().default(1),
  CDP_API_KEY_ID: z.string().optional(),
  CDP_API_KEY_SECRET: z.string().optional(),
  CDP_FACILITATOR_URL: z.string().url().default('https://api.cdp.coinbase.com/platform/v2/x402/facilitator'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_ID_PRO: z.string().optional(),
  LICENSE_SECRET: z.string().min(16).default('change-me-long-random-string-please'),
  LICENSE_ISSUER: z.string().default('claudeoperators.com'),
  UPSTREAM_COMMAND: z.string().optional(),
  UPSTREAM_ARGS: z.string().optional(),
  UPSTREAM_URL: z.string().url().optional(),
  PORT: z.coerce.number().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PRICING_CONFIG: z.string().default('./pricing.json'),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const env = parsed.data;
  if (!env.UPSTREAM_COMMAND && !env.UPSTREAM_URL) {
    throw new Error('Must set UPSTREAM_COMMAND (stdio MCP) or UPSTREAM_URL (HTTP MCP)');
  }
  return env;
}

const PriceEntrySchema = z.object({
  amountUsd: z.number().nonnegative(),
  description: z.string().optional(),
});

const PricingSchema = z.object({
  defaultAmountUsd: z.number().nonnegative().default(0.001),
  freeTier: z.object({
    callsPerDay: z.number().int().nonnegative().default(0),
  }).default({ callsPerDay: 0 }),
  routes: z.record(PriceEntrySchema).default({}),
});

export type Pricing = z.infer<typeof PricingSchema>;

export function loadPricing(path: string): Pricing {
  try {
    const raw = readFileSync(resolve(path), 'utf8');
    return PricingSchema.parse(JSON.parse(raw));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to load pricing config ${path}: ${msg}`);
  }
}

export function priceForRoute(pricing: Pricing, route: string): number {
  const entry = pricing.routes[route];
  if (entry) return entry.amountUsd;
  return pricing.defaultAmountUsd;
}
