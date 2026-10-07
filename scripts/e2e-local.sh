#!/usr/bin/env bash
# Full local end-to-end: validator + keys + collateral + resolver service + the 4 scenarios in parallel (time-compressed).
# Verifies that each scenario resolves on-chain to its expected outcome. Needs `anchor build` done first.
set -uo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
E2E=.e2e; rm -rf "$E2E"; mkdir -p "$E2E"
export KEYS_DIR="$E2E/keys" DATA_DIR="$E2E/data" ENV_FILE="$E2E/none.env"
export RPC_URL=http://127.0.0.1:8899 SAMPLE_INTERVAL_SECS=2 MAX_STALENESS_SECS=10 MIN_LIQUIDITY_USD=10000 PORT=8787
PIDS=()
cleanup() { for p in "${PIDS[@]}"; do kill "$p" 2>/dev/null; done; }
trap cleanup EXIT

ledger="$E2E/ledger"
PID=$(python3 -c "import json;print(json.load(open('sdk/src/idl/lifecycle_markets.json'))['address'])")
solana-test-validator --reset --quiet --ledger "$ledger" --bpf-program "$PID" target/deploy/lifecycle_markets.so >/dev/null 2>&1 &
PIDS+=($!)
for i in $(seq 1 60); do curl -s -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' $RPC_URL 2>/dev/null | grep -q ok && break; sleep 1; done

npm run -s keys >/dev/null
export DEMO_AUTHORITY=$(solana address -k "$KEYS_DIR/demo-authority.json")
rm -f deployments/localnet.json
npm run -s create-collateral || exit 1
npm run -s resolver > "$E2E/resolver.log" 2>&1 &
PIDS+=($!)
sleep 6

DUR=${DUR:-160}; WIN=${WIN:-120}
NAMES=(organic_growth pump_and_dump_attack thin_liquidity stays_below)
SPIDS=()
for s in "${NAMES[@]}"; do
  npm run -s scenario -- $s --duration $DUR --window $WIN --tick 2 > "$E2E/$s.log" 2>&1 &
  SPIDS+=($!)
done
FAIL=0
for i in 0 1 2 3; do
  s=${NAMES[$i]}
  if wait "${SPIDS[$i]}"; then echo "PASS $s"; else echo "FAIL $s (see $E2E/$s.log)"; FAIL=1; fi
done
echo "--- resolver API ---"
curl -s localhost:8787/health; echo
curl -s localhost:8787/markets | python3 -c "import sys,json;[print(m['market'],m['status'],m['sampleCount']) for m in json.load(sys.stdin)]"
M=$(curl -s localhost:8787/markets | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['market'])")
echo "samples: $(curl -s "localhost:8787/markets/$M/samples?limit=3" | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d['samples']),'returned, threshold',d['threshold'])")"
echo "evidence: $(curl -s localhost:8787/markets/$M/evidence | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['outcome'],d['hash'][:16],'tx',d['txSignature'][:12])")"
exit $FAIL
