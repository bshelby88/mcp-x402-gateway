# mcp-x402-gateway

Drop-in paywall for any MCP server. Wrap stdio or HTTP MCPs with:

- **x402 micropayments** — USDC on Base via Coinbase CDP facilitator (zero fee).
- **License keys** — HMAC-signed tokens for Pro/Business/Enterprise tiers.
- **Stripe fallback** — fiat subscriptions for users who do not want to hold USDC.
- **Per-route pricing** — JSON config, no code changes.

## Why

Every MCP builder ships tools for free and hopes for stars. The x402 protocol (HTTP 402 revived by Coinbase) makes per-call USDC payments as easy as an HTTP header. This gateway bolts that onto any existing MCP without forking it.

## Install

```bash
npm install mcp-x402-gateway
# or run directly
npx mcp-x402-gateway
```

## Quick start — wrap a stdio MCP

```bash
cp .env.example .env
# edit .env, set X402_PAY_TO_ADDRESS + UPSTREAM_COMMAND

# wrap nanobanana-mcp (Gemini image gen) with pay-per-call
UPSTREAM_COMMAND="npx" \
UPSTREAM_ARGS="-y nanobanana-mcp@2.0.0" \
X402_PAY_TO_ADDRESS="0xYourBaseWalletHere" \
GEMINI_API_KEY="..." \
npx mcp-x402-gateway
```

## Quick start — wrap an HTTP MCP

```bash
UPSTREAM_URL="http://localhost:3000" \
X402_PAY_TO_ADDRESS="0xYourBaseWalletHere" \
npx mcp-x402-gateway
```

## Pricing config

`pricing.json`:

```json
{
  "defaultAmountUsd": 0.001,
  "freeTier": { "callsPerDay": 0 },
  "routes": {
    "POST /mcp/generate_image": { "amountUsd": 0.05 },
    "POST /mcp/swarm_init": { "amountUsd": 0.002 }
  }
}
```

## Calling a paywalled route

```bash
# First call — gateway returns 402 with payment requirements
curl -X POST http://localhost:8787/mcp/generate_image \
  -H 'content-type: application/json' \
  -d '{"prompt":"astronaut on mars"}'

# Agent signs payment, retries with X-Payment header
curl -X POST http://localhost:8787/mcp/generate_image \
  -H 'content-type: application/json' \
  -H "X-Payment: $(x402-sign ...)" \
  -d '{"prompt":"astronaut on mars"}'
```

License-key tier bypasses x402 entirely:

```bash
curl -X POST http://localhost:8787/mcp/generate_image \
  -H "X-License-Key: $LICENSE_TOKEN" \
  -d '{"prompt":"..."}'
```

## Programmatic use

```ts
import { startGateway } from 'mcp-x402-gateway';

const server = await startGateway();
// later:
await server.stop();
```

## License issuance

```ts
import { issueLicense } from 'mcp-x402-gateway';

const token = issueLicense(env, {
  sub: 'customer_abc123',
  tier: 'business',
  exp: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
});
```

Hand this token to paying customers (Stripe webhook on subscription.created).

## Architecture

```
  agent -> [gateway :8787] -> [upstream MCP: stdio OR http]
              |
              +-> x402 facilitator (Coinbase CDP)
              +-> license verifier (HMAC)
              +-> Stripe webhooks (planned)
```

- Request arrives → middleware checks `X-License-Key` first.
- If no license, checks `X-Payment` and verifies via CDP facilitator.
- If no payment, returns `402 Payment Required` with requirements.
- On verified payment, settles atomically and forwards to upstream.

## Roadmap

- [x] x402 verify + settle via Coinbase CDP
- [x] HMAC license keys
- [x] stdio and HTTP upstream
- [x] per-route pricing JSON
- [ ] Stripe webhook → auto-issue license
- [ ] Rate limit per payer address
- [ ] Usage analytics dashboard
- [ ] Multi-chain (Solana facilitator)
- [ ] Self-hosted facilitator option

## License

MIT.
