import express, { type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { request as undiciRequest } from 'undici';
import { loadEnv, loadPricing, type Env, type Pricing } from './config.js';
import { StdioBridge } from './stdio-bridge.js';
import { x402Middleware } from './middleware.js';

interface Logger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

function createLogger(level: string): Logger {
  const levels: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };
  const threshold = levels[level] ?? 1;
  const log = (lvl: string, msg: string, meta?: unknown) => {
    if ((levels[lvl] ?? 1) < threshold) return;
    const record = { level: lvl, msg, ts: new Date().toISOString(), ...(meta && typeof meta === 'object' ? meta : { meta }) };
    process.stdout.write(`${JSON.stringify(record)}\n`);
  };
  return {
    info: (msg, meta) => log('info', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    error: (msg, meta) => log('error', msg, meta),
  };
}

interface StartedServer {
  stop: () => Promise<void>;
}

export async function startGateway(overrides?: Partial<Env>): Promise<StartedServer> {
  const env = { ...loadEnv(), ...overrides };
  const pricing: Pricing = loadPricing(env.PRICING_CONFIG);
  const logger = createLogger(env.LOG_LEVEL);

  const bridge = env.UPSTREAM_COMMAND
    ? new StdioBridge({
        command: env.UPSTREAM_COMMAND,
        args: env.UPSTREAM_ARGS ? env.UPSTREAM_ARGS.split(' ').filter(Boolean) : [],
        logger,
      })
    : null;

  const app = express();
  app.use(helmet());
  app.use(cors({ origin: '*', exposedHeaders: ['X-Payment-Response'] }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, upstream: env.UPSTREAM_COMMAND ? 'stdio' : 'http', chain: env.X402_CHAIN });
  });

  app.get('/pricing', (_req: Request, res: Response) => {
    res.json(pricing);
  });

  app.use(x402Middleware({ env, pricing, logger }));

  app.post('/mcp/:method', async (req: Request, res: Response) => {
    const methodParam = req.params.method;
    const method = Array.isArray(methodParam) ? methodParam[0] : methodParam;
    if (!method) {
      res.status(400).json({ error: 'method required' });
      return;
    }

    try {
      if (bridge) {
        const result = await bridge.call(method, req.body);
        res.json({ success: true, data: result, meta: req.x402 });
        return;
      }

      if (!env.UPSTREAM_URL) {
        res.status(500).json({ error: 'no upstream configured' });
        return;
      }

      const upstream = await undiciRequest(`${env.UPSTREAM_URL.replace(/\/$/, '')}/mcp/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body ?? {}),
      });
      const body = await upstream.body.json();
      res.status(upstream.statusCode).json({ success: upstream.statusCode < 400, data: body, meta: req.x402 });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'unknown error';
      logger.error('mcp-call-failed', { method, message });
      res.status(502).json({ success: false, error: message });
    }
  });

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info('gateway-started', {
      host: env.HOST,
      port: env.PORT,
      upstream: env.UPSTREAM_COMMAND ?? env.UPSTREAM_URL,
      payTo: env.X402_PAY_TO_ADDRESS,
    });
  });

  return {
    stop: async () => {
      bridge?.shutdown();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
