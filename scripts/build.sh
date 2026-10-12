#!/usr/bin/env bash
# bash scripts/build.sh test  -> target/deploy/             (includes the TEST-ONLY demo feed; used by tests and the local stack)
# bash scripts/build.sh prod  -> target/deploy-prod/        (the program you deploy: NO demo feed)
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
case "${1:-}" in
  test) anchor build -- --features demo-feed ;;
  prod)
    anchor build
    mkdir -p target/deploy-prod
    cp target/deploy/lifecycle_markets.so target/deploy-prod/lifecycle_markets.so
    echo "production build: $(wc -c < target/deploy-prod/lifecycle_markets.so | tr -d ' ') bytes"
    # leave the test build in place for `cargo test`
    anchor build -- --features demo-feed >/dev/null
    ;;
  *) echo "usage: scripts/build.sh test|prod"; exit 1 ;;
esac
bash scripts/sync-idl.sh
