#!/usr/bin/env bash
# Starts a local validator with the program preloaded (for development; devnet is the real target).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
PID=$(python3 -c "import json;print(json.load(open('sdk/src/idl/lifecycle_markets.json'))['address'])")
exec solana-test-validator --reset --ledger .localnet-ledger --bpf-program "$PID" target/deploy/lifecycle_markets.so "$@"
