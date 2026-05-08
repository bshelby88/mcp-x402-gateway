#!/usr/bin/env bash
# Example: wrap ruflo (claude-flow) HTTP MCP behind x402 gateway
set -euo pipefail

export X402_PAY_TO_ADDRESS="0xYourBaseWalletHere"
export X402_CHAIN="base"
export X402_ASSET="USDC"

export UPSTREAM_URL="http://localhost:3000"
export PORT=8787
export PRICING_CONFIG="./examples/pricing.json"

# Start ruflo MCP server in background first (HTTP transport on :3000)
# npx claude-flow@v3alpha mcp start --transport http --port 3000 &

exec node dist/cli.js
