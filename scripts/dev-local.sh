#!/usr/bin/env bash
# One-command local stack for UI development: validator + keys + collateral + resolver + faucet + seeded markets.
# Prints the web/.env.local values. Ctrl-C stops everything.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
D=.devlocal; rm -rf "$D"; mkdir -p "$D"
export KEYS_DIR="$D/keys" DATA_DIR="$D/data" ENV_FILE="$D/none.env" RPC_URL=http://127.0.0.1:8899 SAMPLE_INTERVAL_SECS=2 MAX_STALENESS_SECS=15 PORT=8787 FAUCET_PORT=8788
PIDS=(); trap 'for p in "${PIDS[@]}"; do kill $p 2>/dev/null; done' EXIT
PID=$(python3 -c "import json;print(json.load(open('sdk/src/idl/lifecycle_markets.json'))['address'])")
solana-test-validator --reset --quiet --ledger "$D/ledger" --bpf-program "$PID" target/deploy/lifecycle_markets.so >/dev/null 2>&1 & PIDS+=($!)
for i in $(seq 1 60); do curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' $RPC_URL 2>/dev/null | grep -q ok && break; sleep 1; done
npm run -s keys >/dev/null
export DEMO_AUTHORITY=$(solana address -k "$KEYS_DIR/demo-authority.json")
rm -f deployments/localnet.json
npm run -s create-collateral >/dev/null
npm run -s seed
npm run -s resolver > "$D/resolver.log" 2>&1 & PIDS+=($!)
npm run -s faucet-server > "$D/faucet.log" 2>&1 & PIDS+=($!)
MINT=$(python3 -c "import json;print(json.load(open('deployments/localnet.json'))['collateralMint'])")
cat > web/.env.local <<ENV
VITE_RPC_URL=$RPC_URL
VITE_CLUSTER=localnet
VITE_COLLATERAL_MINT=$MINT
VITE_DEMO_AUTHORITY=$DEMO_AUTHORITY
VITE_RESOLVER_API=http://localhost:8787
VITE_FAUCET_API=http://localhost:8788
VITE_RESOLVER_PUBKEY=$(solana address -k "$KEYS_DIR/resolver.json")
ENV
echo "Stack is up. web/.env.local written. Run: npm run web   (Ctrl-C here to stop the stack)"
echo "Try a live scenario:  KEYS_DIR=$KEYS_DIR RPC_URL=$RPC_URL ENV_FILE=$D/none.env npm run scenario -- organic_growth --duration 150 --window 90 --tick 2"
wait
