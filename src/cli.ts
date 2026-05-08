#!/usr/bin/env node
import { startGateway } from './server.js';

const HELP = `mcp-x402-gateway — drop-in paywall for any MCP server

Usage:
  mcp-x402-gateway              start the gateway (reads env vars)
  mcp-x402-gateway --help       show this help
  mcp-x402-gateway --version    print version

Required env vars:
  X402_PAY_TO_ADDRESS           Base address to receive USDC payments
  UPSTREAM_COMMAND              command to wrap (stdio MCP), or
  UPSTREAM_URL                  HTTP MCP endpoint to proxy

Optional:
  PORT                          listen port (default 3000)
  STRIPE_SECRET_KEY             enable Stripe fallback
  LICENSE_HMAC_SECRET           enable license-key auth

Docs: https://github.com/bshelby88/mcp-x402-gateway
`;

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === '--help' || arg === '-h') { process.stdout.write(HELP); process.exit(0); }
  if (arg === '--version' || arg === '-v') {
    const pkg = await import('../package.json', { with: { type: 'json' } }).catch(() => null);
    const version = (pkg?.default as { version?: string } | null)?.version ?? '0.0.0';
    process.stdout.write(`${version}\n`); process.exit(0);
  }

  const started = await startGateway();
  const shutdown = async (signal: string): Promise<void> => {
    process.stdout.write(`\n[gateway] received ${signal}, shutting down\n`);
    await started.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[gateway] fatal: ${message}\n`);
  process.exit(1);
});
