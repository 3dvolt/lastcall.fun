#!/usr/bin/env bash
# Copies the Anchor-generated IDL + TS types into the SDK. Run after `anchor build`.
set -euo pipefail
cd "$(dirname "$0")/.."
cp target/idl/lifecycle_markets.json sdk/src/idl/lifecycle_markets.json
cp target/types/lifecycle_markets.ts sdk/src/idl/lifecycle_markets.ts
echo "IDL synced: $(python3 -c "import json;print(json.load(open('sdk/src/idl/lifecycle_markets.json'))['address'])")"
