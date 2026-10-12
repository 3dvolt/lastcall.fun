#!/usr/bin/env bash
# Deploys the program to DEVNET (or localhost) with keys/program.json (program id) and keys/deployer.json (payer + upgrade authority).
#   bash scripts/deploy.sh test   (default on devnet) includes the TEST-ONLY demo price feed: lets you run scripted scenarios on devnet
#   bash scripts/deploy.sh prod   the production build (reads PumpSwap + Pyth only). Needs real PumpSwap pools: they do not exist on devnet.
# Mainnet is deliberately NOT supported here: see the "Mainnet" section of the README and deploy by hand.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
VARIANT="${1:-test}"
URL="${RPC_URL:-https://api.devnet.solana.com}"
case "$URL" in
  *devnet*|*localhost*|*127.0.0.1*) ;;
  *) echo "Refusing to deploy to $URL (devnet/localhost only; see the Mainnet section of the README)"; exit 1;;
esac
[ -f keys/program.json ] && [ -f keys/deployer.json ] || { echo "run: npm run keys"; exit 1; }
case "$VARIANT" in
  test) bash scripts/build.sh test; SO=target/deploy/lifecycle_markets.so
        echo ">> deploying the TEST build (demo price feed enabled). Never use this build on mainnet." ;;
  prod) bash scripts/build.sh prod; SO=target/deploy-prod/lifecycle_markets.so ;;
  *) echo "usage: scripts/deploy.sh test|prod"; exit 1 ;;
esac
SIZE=$(wc -c < "$SO" | tr -d ' ')
# Default --max-len is 2x the program size, which DOUBLES the rent. Reserve exactly the size instead;
# if a future version is larger, grow it with: solana program extend <program id> <extra bytes>
solana program deploy "$SO" --url "$URL" --keypair keys/deployer.json --program-id keys/program.json --max-len "$SIZE"
echo "Deployed ($VARIANT build). Program id: $(solana address -k keys/program.json)"
