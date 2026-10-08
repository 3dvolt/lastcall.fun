# Last Call — prediction markets on newly launched tokens (DEVNET DEMO)

*last-call.fun · "Will this new token still be standing when the bell rings?"*

Binary YES/NO markets such as *"Will token T have a market cap ≥ $1,000,000 at expiry?"*, built on Solana (Anchor).
The betting AMM is standard; the differentiator is the **resolution rule**, which is designed to resist the pump-for-a-few-seconds
manipulation that thin new tokens are prone to (see [CONTRACT.md §7](CONTRACT.md)).

> **DEVNET ONLY.** Collateral is a worthless test SPL token that we mint. The services refuse to start against a mainnet RPC.

## What is centralized or mocked (disclose this in the pitch)

| Part | Reality in this demo |
|---|---|
| **Resolver** | A single devnet keypair per market (`resolver`), run by the resolver service. It alone can call `resolve`; the chain stores only the sha256 of the evidence. No timeout / permissionless fallback: if the resolver is down, markets stay open. |
| **Price feed** | `DemoFeed` PDA written by one demo authority (and by the scenario scripts). The resolver reads it via a pluggable `Provider` interface; `MockProvider` is the only implementation. Not a real oracle. |
| **Collateral** | Test token; faucet script/server mint it freely. |
| **Void** | Pays the final *marginal price* per share, not what you paid (not a true refund). |
| `token_ref` | Opaque pubkey, not verified to be a real mint. |

## Repo layout

```
programs/lifecycle_markets   Anchor program (Rust). math.rs = pure pricing math; tests/ = LiteSVM tests
sdk/                         TypeScript client generated from the IDL + BigInt mirror of the on-chain math (+ tests)
resolver/                    Sampler + evaluator + resolver loop + read-only HTTP API (Node/TS), MockProvider
scripts/                     keys, deploy, collateral mint, faucet, seed markets, scenarios, local e2e
deployments/<cluster>.json   public addresses (program id, collateral mint, markets) for the frontend
CONTRACT.md                  interface doc for the frontend team
```

## Versions (pinned)

Anchor CLI/crates `1.2.1`, Agave/Solana CLI `4.3.0`, Rust `1.99.0` (`rust-toolchain.toml`), LiteSVM `0.17`, Node ≥ 20 (tested 25),
`@anchor-lang/core 1.2.1`, `@solana/web3.js 1.99.0`, `@solana/spl-token 0.4.15`, TypeScript `5.9.3`.
The program is built with the `solana-v4` crate cohort of Anchor (`anchor-lang`/`anchor-spl` features) because the LiteSVM
version that can load Agave 4.3-built programs uses the v4 types.

## Setup

```bash
# toolchain (once)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
cargo install --git https://github.com/solana-foundation/anchor avm --force && avm install 1.2.1 && avm use 1.2.1

npm install
anchor build            # builds target/deploy/lifecycle_markets.so and the IDL
npm run sync-idl        # copies IDL + TS types into sdk/src/idl
npm run build           # builds the SDK (dist/)
```

## Tests

```bash
anchor build && cargo test -p lifecycle_markets     # math unit tests + 12 flow tests + randomized solvency (75 seeded sequences)
npm test -w sdk          # TS math vs Rust vectors (bit-exact) + e2e against a spawned solana-test-validator
npm test -w resolver     # rule tests: scenarios (a)-(d), boundaries (90% / 80% / liquidity), hash determinism
npm run e2e-local        # validator + resolver service + the 4 scenarios in parallel, asserts on-chain outcomes (~4 min)
```
Regenerate cross-language vectors after touching `math.rs`: `GEN_VECTORS=1 cargo test -p lifecycle_markets --test gen_vectors`.

## Devnet runbook

```bash
cp .env.example .env
npm run keys                             # creates gitignored keys/*.json, prints public keys
# edit .env: DEMO_AUTHORITY=<demo-authority public key printed above>

# 1. fund the deployer (~4 SOL needed for the deploy; devnet only)
solana airdrop 2 $(solana address -k keys/deployer.json) --url devnet     # repeat, or use https://faucet.solana.com

# 2. deploy
npm run deploy:devnet                    # = bash scripts/deploy.sh (anchor build + sync IDL + solana program deploy)

# 3. test collateral + (optional) faucet server for the frontend
npm run create-collateral                # writes deployments/devnet.json
npm run faucet -- <wallet> 1000          # CLI: mint 1000 test tokens
npm run faucet-server                    # POST :8788/faucet {"wallet": "..."}

# 4. showcase markets (long expiries) and the resolver service
npm run seed
npm run resolver                         # sampler + resolver + read-only API on :8787

# 5. live demo scenarios (3-10 minute markets). Run the resolver in another terminal first.
npm run scenario -- organic_growth       --duration 240 --window 120 --tick 5   # -> YES
npm run scenario -- pump_and_dump_attack --duration 240 --window 120 --tick 5   # -> NO
npm run scenario -- thin_liquidity       --duration 240 --window 120 --tick 5   # -> VOID
npm run scenario -- stays_below          --duration 240 --window 120 --tick 5   # -> NO
```
Each scenario creates a fresh market, places two opposing trades, drives the feed, waits for the resolver, then redeems and claims
and prints PASS/FAIL against the expected outcome. Use `SAMPLE_INTERVAL_SECS=2` in `.env` for short demos (default 10).
For the production-like parameters (10 s sampling, 5 min window) use `--duration 480 --window 300`.

Resolver key rotation: the key is fixed per market at creation (`resolver` account). To change it, create new markets.

Local development without devnet: `bash scripts/localnet.sh` (validator with the program preloaded) and set `RPC_URL=http://127.0.0.1:8899`.

## Secrets

No secrets are committed: `keys/`, `.env`, `data/`, `.e2e/` are gitignored. `deployments/*.json` hold public keys only.

## Web UI (`web/`)

React + Vite + TypeScript, built on the SDK. Wallets come from the Wallet Standard (Phantom, Solflare, Backpack… auto-detected); the app never sees keys.

```bash
# local development against a local validator (starts validator, resolver, faucet, seeds markets; writes web/.env.local)
bash scripts/dev-local.sh        # terminal 1
npm run web                      # terminal 2 -> http://localhost:5173

# devnet: copy web/.env.example to web/.env.local and fill VITE_COLLATERAL_MINT / VITE_DEMO_AUTHORITY
npm run web:build                # static site in web/dist
```
Pages: market list, market detail (odds, live market-cap chart with the resolution window, buy/sell with quotes + slippage, position, redeem/claim, resolution evidence), create market, header faucet button.

Safety built in: devnet/localhost-only config check and a mainnet genesis-hash refusal; every transaction goes through a confirmation dialog with exact amounts and minimums; strict amount parsing (BigInt, ≤ 6 decimals); program errors translated to plain language; the evidence hash shown on a resolved market is re-computed in the browser and compared with the one committed on-chain; feeds written by an unexpected authority are flagged; no `dangerouslySetInnerHTML`, no secrets in the bundle, `credentials: omit` on API calls; production build injects a strict CSP meta tag. When hosting, also send `Content-Security-Policy` (incl. `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff` and `Referrer-Policy: no-referrer` as real HTTP headers (a meta tag cannot set `frame-ancestors`).
