import type { NextFunction, Request, Response } from 'express';
import { buildPaymentRequirements, settlePayment, verifyPayment } from './facilitator.js';
import { licenseCoversRoute, verifyLicense } from './licenses.js';
import { priceForRoute, type Env, type Pricing } from './config.js';

declare module 'express-serve-static-core' {
  interface Request {
    x402?: {
      payer?: string;
      amountUsd: number;
      settleTxn?: string;
      licensed?: boolean;
    };
  }
}

interface GatewayDeps {
  env: Env;
  pricing: Pricing;
  logger: { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void; error: (msg: string, meta?: unknown) => void };
}

export function x402Middleware(deps: GatewayDeps) {
  const { env, pricing, logger } = deps;

  return async function (req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.method === 'GET' && (req.path === '/health' || req.path === '/pricing')) {
      next();
      return;
    }

    const route = `${req.method} ${req.path}`;
    const amountUsd = priceForRoute(pricing, route);

    if (amountUsd === 0) {
      next();
      return;
    }

    const license = typeof req.headers['x-license-key'] === 'string' ? req.headers['x-license-key'] : undefined;
    if (license) {
      const claims = verifyLicense(env, license);
      if (claims && licenseCoversRoute(claims, route)) {
        req.x402 = { amountUsd, licensed: true };
        logger.info('license-authorized', { route, sub: claims.sub, tier: claims.tier });
        next();
        return;
      }
      logger.warn('license-rejected', { route });
    }

    const payment = typeof req.headers['x-payment'] === 'string' ? req.headers['x-payment'] : undefined;
    const requirements = buildPaymentRequirements(env, route, amountUsd, `Tool call ${route}`);

    if (!payment) {
      res.status(402).json({
        x402Version: env.X402_NETWORK_VERSION,
        accepts: [requirements],
        error: 'payment required',
      });
      return;
    }

    const verification = await verifyPayment(env, payment, requirements);
    if (!verification.isValid) {
      res.status(402).json({
        x402Version: env.X402_NETWORK_VERSION,
        accepts: [requirements],
        error: verification.invalidReason ?? 'invalid payment',
      });
      return;
    }

    const settlement = await settlePayment(env, payment, requirements);
    if (!settlement.success) {
      res.status(402).json({
        x402Version: env.X402_NETWORK_VERSION,
        accepts: [requirements],
        error: settlement.errorReason ?? 'settlement failed',
      });
      return;
    }

    req.x402 = {
      payer: settlement.payer ?? verification.payer,
      amountUsd,
      settleTxn: settlement.transaction,
    };

    res.setHeader('X-Payment-Response', JSON.stringify({
      success: true,
      transaction: settlement.transaction,
      network: settlement.network,
      payer: settlement.payer,
    }));

    logger.info('paid-request', { route, amountUsd, txn: settlement.transaction, payer: settlement.payer });
    next();
  };
}
