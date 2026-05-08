#!/usr/bin/env bash
# Example: wrap the upstream nanobanana-mcp (stdio) behind x402 + Stripe gateway
set -euo pipefail

export X402_PAY_TO_ADDRESS="0xYourBaseWalletHere"
export X402_CHAIN="base"
export X402_ASSET="USDC"
export CDP_API_KEY_ID="${CDP_API_KEY_ID:-}"
export CDP_API_KEY_SECRET="${CDP_API_KEY_SECRET:-}"

export UPSTREAM_COMMAND="npx"
export UPSTREAM_ARGS="-y nanobanana-mcp@2.0.0"
export GEMINI_API_KEY="${GEMINI_API_KEY:?set GEMINI_API_KEY}"

export PORT=8787
export PRICING_CONFIG="./examples/pricing.json"

exec node dist/cli.js
