#!/usr/bin/env bash
# Deploys the program to DEVNET using keys/program.json (program id) and keys/deployer.json (payer + upgrade authority).
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
URL="${RPC_URL:-https://api.devnet.solana.com}"
case "$URL" in
  *devnet*|*localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to deploy to $URL (devnet/localhost only)"; exit 1;;
esac
[ -f keys/program.json ] && [ -f keys/deployer.json ] || { echo "run: npm run keys  (after anchor build)"; exit 1; }
anchor build
bash scripts/sync-idl.sh
solana program deploy target/deploy/lifecycle_markets.so \
  --url "$URL" --keypair keys/deployer.json --program-id keys/program.json
echo "Deployed. Program id: $(solana address -k keys/program.json)"
