# CONTRACT.md — Last Call: interface for the frontend team

> **DEVNET ONLY. DEMO.** Collateral is a test SPL token minted by us. The resolver is a single centralized key and the price
> feed is a mock written by a single demo authority (see "Centralized / mocked parts"). Version: `0.1.0` (M3 — on-chain
> parts and SDK are final; HTTP API and scenarios are **specified here and implemented in M4**).

## 1. Quick facts

| | |
|---|---|
| Program ID | `2oLfv3LDx7bDCzbnkzuvmT13s6xrxWawJr97NcGmKwLJ` (devnet id is final once deployed in M5; read it from `PROGRAM_ID` exported by the SDK) |
| Framework | Anchor `1.2.1`, classic SPL Token program |
| Cluster | devnet only (`https://api.devnet.solana.com`) |
| Collateral | test SPL mint, **6 decimals** (address printed by `scripts/create-collateral` and listed in `deployments/devnet.json`) |
| Money units | collateral: base units (1 token = 1_000_000). USD prices/thresholds/market cap/liquidity: **6 decimals** (`$1.50` = `1_500_000`) |
| Shares | 1 share pays exactly 1 collateral **base unit** if it wins. Shares have no separate decimals: `shares` are in the same units as collateral. |
| Time | unix seconds (`i64`). Trading uses the cluster clock. |
| IDL | `sdk/src/idl/lifecycle_markets.json` (+ `.ts` types) |
| SDK | `@lifecycle-markets/sdk` (`/sdk`). All u64 values are `bigint`. |

## 2. PDA seeds

| Account | Seeds | Notes |
|---|---|---|
| Market | `["market", creator, market_id as u64 LE]` | |
| Vault | `["vault", market]` | SPL token account (collateral mint); **owner/authority = the Market PDA** |
| Position | `["position", market, user]` | created on the user's first `buy` |
| DemoFeed | `["feed", token_ref]` | demo only |

SDK: `marketPda`, `vaultPda`, `positionPda`, `feedPda` (or `client.marketAddress(...)` etc.).

## 3. Account layouts

Anchor accounts (8-byte discriminator + borsh). Names below are the TS (camelCase) field names; the SDK returns `bigint` for u64/i64.

### Market
| field | type | meaning |
|---|---|---|
| creator | Pubkey | |
| marketId | u64 | |
| collateralMint | Pubkey | |
| vault | Pubkey | vault token account (PDA) |
| tokenRef | Pubkey | opaque id of the tracked token; key of its `DemoFeed` |
| threshold | u64 | USD (6 dec). YES iff market cap ≥ threshold, evaluated by the resolver (§7) |
| expiryTs | i64 | trading stops at `expiryTs`; `resolve` allowed from `expiryTs` |
| resolutionWindowSecs | u32 | sampling window the resolver must evaluate, ending at `expiryTs` (≤ 7 days) |
| resolver | Pubkey | only key allowed to call `resolve` |
| status | enum | `open` \| `resolvedYes` \| `resolvedNo` \| `void` |
| yesReserve, noReserve | u64 | pool reserves (AMM state) |
| totalMinted | u64 | complete sets minted (1 YES + 1 NO each) |
| feeBps | u16 | trading fee, ≤ 1000 |
| feesAccrued | u64 | fees held in the vault, belong to the creator |
| evidenceHash | [u8;32] | sha256 of the evidence JSON (zeros until resolved) |
| voidYesPrice, voidNoPrice | u64 | Void only: redemption price per share, scaled by 1e9 |
| userObligation | u64 | set at resolution: max collateral users can still redeem |
| residualClaimed | bool | |

**Vault identity (holds at all times before payouts):** `vault.amount == totalMinted + feesAccrued`.
Shares: `sum(user YES shares) + yesReserve == totalMinted` and same for NO.

### Position
`market`, `user`, `yesShares: u64`, `noShares: u64`, `redeemed: bool`.

### DemoFeed (demo only)
`tokenRef`, `price` (USD, 6 dec), `circulatingSupply` (**whole tokens**), `liquidityUsd` (6 dec), `updatedTs`, `authority`.
Market cap (USD, 6 dec) = `price * circulatingSupply`.
> The first signer to write a feed for a `tokenRef` becomes its `authority` (init-if-needed). Consumers (resolver, frontend)
> must check `feed.authority` against the known demo authority pubkey (`DEMO_AUTHORITY` in `deployments/devnet.json`).

## 4. Instructions

| ix | args | signer | effect |
|---|---|---|---|
| `create_market` | `market_id u64, token_ref Pubkey, threshold u64, expiry_ts i64, resolution_window_secs u32, initial_liquidity u64, fee_bps u16` | creator | creates Market + Vault, moves `initial_liquidity` collateral from creator to vault; `yes=no=totalMinted=L`. The **resolver pubkey is passed as an account**, not an arg. |
| `buy` | `side {Yes\|No}, collateral_in u64, min_shares_out u64` | user | pays `collateral_in` (fee included), receives shares. Creates Position if needed. Only while `open` and `now < expiryTs`. |
| `sell` | `side, shares_in u64, min_collateral_out u64` | user | burns shares, receives collateral net of fee. Same time restriction. |
| `resolve` | `outcome {Yes\|No\|Void}, evidence_hash [u8;32]` | resolver | only when `now ≥ expiryTs` and `open`. Freezes the market. |
| `redeem` | — | user | after resolution; pays the whole position once (`redeemed` flag). |
| `claim_residual` | — | creator | after resolution; pays `totalMinted + feesAccrued − userObligation` once. |
| `demo_set_feed` | `token_ref, price, circulating_supply, liquidity_usd` | feed authority | DEMO ONLY. |

Accounts per instruction (all in the IDL; the SDK fills them in): `buy/sell/redeem` = user, market, position, user_collateral
(user's token account of the collateral mint), vault, token_program (+ system_program for buy). `create_market` = creator, market, collateral_mint,
vault, creator_collateral, resolver, token_program, system_program.

Payouts:
- `ResolvedYes`: `yesShares`; `ResolvedNo`: `noShares`; losing shares pay 0.
- `Void`: `floor(yesShares * voidYesPrice / 1e9) + floor(noShares * voidNoPrice / 1e9)` where
  `voidYesPrice = floor(noReserve*1e9/(yes+no))`, `voidNoPrice = floor(yesReserve*1e9/(yes+no))` at resolution.
  **Void is NOT a refund of what you paid**: you get the final marginal price per share (someone who bought YES at 0.80 and is Void at 0.55 gets back less).
- Creator residual: YES → `yesReserve + feesAccrued`; NO → `noReserve + feesAccrued`; Void → `totalMinted + feesAccrued − userObligation`.

## 5. Exact quote formulas (bit-for-bit mirrored by SDK `quoteBuy` / `quoteSell`; checked against Rust vectors in CI)

Let `y, n` be the reserves, `fee_bps` the market fee. All integers; `/` is integer division.

- `price_yes = n / (y + n)`, `price_no = y / (y + n)` (display only; SDK `priceYes`, `priceNo`).
- `fee(x) = ceil(x * fee_bps / 10000)`.
- **Buy** side S with `a` collateral (S = YES: `own=y, other=n`; S = NO: `own=n, other=y`):
  1. `fee = fee(a)`, `net = a − fee` (must be > 0)
  2. `new_own = own + net`, `new_other = other + net`, `k = own * other`
  3. `own' = ceil(k / new_other)`; **`shares_out = new_own − own'`** (must be > 0)
  4. state: `own := own'`, `other := new_other`, `totalMinted += net`, `feesAccrued += fee`
- **Sell** `s` shares of side S:
  1. `sum = own + s + other`; `disc = sum² − 4·s·other`; `root = ceil(sqrt(disc))`
  2. `gross = floor((sum − root) / 2)` (must be > 0); `fee = fee(gross)`; **`payout = gross − fee`**
  3. state: `own := own + s − gross`, `other := other − gross`, `totalMinted −= gross`, `feesAccrued += fee`
- Rounding always favors the pool. Reserves and `totalMinted` are capped at `2^62`.
- Slippage args: `min_shares_out ≤ shares_out`, `min_collateral_out ≤ payout`. Use SDK: `client.quoteBuy(market, "yes", amount).sharesOut`.
- The pool product `y·n` never decreases.

Worked example (no fee): `y=n=1000`, buy 100 YES → `shares_out = 190`, reserves `(910, 1100)`, `price_yes = 0.547`.

## 6. Events

Emitted as Anchor events (`Program data:` log lines). Decode with `client.parseEvents(logs)`.

| event | fields |
|---|---|
| `MarketCreated` | market, creator, marketId, tokenRef, threshold, expiryTs, resolutionWindowSecs, resolver, initialLiquidity, feeBps |
| `Trade` | market, user, side, isBuy, collateral (gross-in for buys / net-out for sells), shares, fee, yesReserve, noReserve, ts |
| `Resolved` | market, outcome, evidenceHash, yesReserve, noReserve, userObligation, ts |
| `Redeemed` | market, user, yesShares, noShares, payout |
| `ResidualClaimed` | market, creator, amount |
| `FeedUpdated` | tokenRef, price, circulatingSupply, liquidityUsd, ts |

## 7. Resolution rule (the differentiator)

Evaluated off-chain by the resolver service over the **last `resolutionWindowSecs` before `expiryTs`** using samples every 10 s
(`market_cap = price × circulating_supply`). Rules are applied **in this order** (VOID first — see decision note below):

1. **VOID** if `median(liquidity) < MIN_LIQUIDITY` **or** `sample coverage < 80%` (coverage = samples / expected samples, expected = window / 10 s).
2. **YES** only if `TWAP(market_cap) ≥ threshold` **and** `≥ 90%` of samples have `market_cap ≥ threshold` (sustained, not a spike).
3. otherwise **NO**.

TWAP is the time-weighted mean with each sample held until the next sample (last sample held until window end).
A spike in the final seconds can therefore neither lift the TWAP nor reach 90% of samples. The service writes an evidence JSON
(inputs, parameters, sample summary, per-rule outcomes), takes `sha256` over its canonical form (keys sorted, no whitespace),
and passes that hash to `resolve`. Anyone can re-derive the hash from `GET /markets/:id/evidence`.

> Decision note: the original spec lists VOID third. I evaluate it first so a thin-liquidity token whose few samples happen to be
> high cannot resolve YES. Flag if you want the original order.

## 8. Resolver HTTP API (read-only, JSON; default `http://localhost:8787`, CORS open)

`:id` is the market account address (base58). All u64 values are **decimal strings** (to be JSON-safe); timestamps are unix seconds (numbers).

**`GET /health`**
```json
{ "ok": true, "programId": "…", "cluster": "devnet", "resolver": "<pubkey>", "demoAuthority": "<pubkey>",
  "provider": "mock", "trackedMarkets": 4, "lastSampleTs": 1760000000, "uptimeSecs": 123 }
```

**`GET /markets`** → `[{ "market": "…", "tokenRef": "…", "status": "open|resolvedYes|resolvedNo|void", "expiryTs": 0, "threshold": "…", "resolved": false, "outcome": null, "sampleCount": 0 }]`

**`GET /markets/:id/samples?from=<ts>&to=<ts>&limit=<n>`** (defaults: all, max 5000)
```json
{ "market": "…", "tokenRef": "…", "threshold": "1000000000000", "samples": [
  { "ts": 1760000000, "price": "1500000", "circulatingSupply": "1000000", "liquidityUsd": "50000000000", "marketCap": "1500000000000" } ] }
```

**`GET /markets/:id/evidence`** → 404 until resolved, then:
```json
{ "version": 1, "market": "…", "tokenRef": "…", "threshold": "…", "expiryTs": 0,
  "window": { "startTs": 0, "endTs": 0, "secs": 300 },
  "parameters": { "minLiquidityUsd": "…", "minCoverage": 0.8, "minSustainedFraction": 0.9, "sampleIntervalSecs": 10 },
  "samples": { "count": 30, "expected": 30, "coverage": 1.0, "aboveThresholdFraction": 0.0,
               "marketCap": { "min": "…", "max": "…", "median": "…", "twap": "…" },
               "liquidity": { "min": "…", "median": "…" },
               "series": [[1760000000, "1500000000000"]] },
  "rules": { "liquidityOk": true, "coverageOk": true, "twapAtLeastThreshold": false, "sustainedAtLeastMinFraction": false },
  "outcome": "no", "reason": "…",
  "feed": { "address": "…", "authority": "…" },
  "hash": "<sha256 hex of canonical JSON of this object without the `hash` field>", "txSignature": "…" }
```
The on-chain `evidenceHash` equals `hash`.

## 9. Demo scenarios (names are stable identifiers)

Run by `scripts/scenario <name>` against the feed with a short expiry (3–10 min). Market threshold in all scenarios: **$1,000,000** market cap.

| name | what the feed does | expected |
|---|---|---|
| `organic_growth` | market cap climbs steadily and stays above threshold through the window | **ResolvedYes** |
| `pump_and_dump_attack` | stays below, then spikes far above threshold for a few seconds right before expiry, then drops | **ResolvedNo** (must never resolve YES) |
| `thin_liquidity` | price above threshold but liquidity below `MIN_LIQUIDITY` | **Void** |
| `stays_below` | market cap hovers below threshold | **ResolvedNo** |

## 10. Errors (Anchor custom codes)

| code | name | message |
|---|---|---|
| 6000 | `MathOverflow` | Math overflow or invalid arithmetic |
| 6001 | `ZeroAmount` | Amount must be greater than zero |
| 6002 | `ReserveTooLarge` | Reserve would exceed the supported maximum |
| 6003 | `InsufficientReserve` | Pool reserve too small for this operation |
| 6004 | `InvariantViolated` | Pool invariant would be violated |
| 6005 | `SlippageExceeded` | Slippage limit exceeded |
| 6006 | `MarketNotOpen` | Market is not open |
| 6007 | `TradingClosed` | Trading is closed: market expired |
| 6008 | `NotExpired` | Market has not expired yet |
| 6009 | `NotResolved` | Market is not resolved |
| 6010 | `UnauthorizedResolver` | Signer is not the market resolver |
| 6011 | `UnauthorizedCreator` | Signer is not the market creator |
| 6012 | `UnauthorizedFeedAuthority` | Signer is not the feed authority |
| 6013 | `InvalidExpiry` | Expiry must be in the future |
| 6014 | `InvalidParameter` | Invalid parameter |
| 6015 | `FeeTooHigh` | Fee too high |
| 6016 | `AlreadyRedeemed` | Position already redeemed |
| 6017 | `AlreadyClaimed` | Residual already claimed |
| 6018 | `InsufficientShares` | Not enough shares |
| 6019 | `AccountMismatch` | Account does not match market |
| 6020 | `InvalidCollateralMint` | Collateral mint must not have a freeze authority |

## 11. SDK cheat sheet

```ts
import { LifecycleClient, PROGRAM_ID, quoteBuy } from "@lifecycle-markets/sdk";
const client = new LifecycleClient(anchorProvider /* wallet-adapter wallet */, PROGRAM_ID);
const market = (await client.getMarket(marketPubkey))!;
const q = client.quoteBuy(market, "yes", 5_000_000n);            // 5 collateral tokens
await client.buy(market, "yes", 5_000_000n, q.sharesOut * 99n / 100n); // 1% slippage
const pos = await client.getPosition(market.address, wallet);
await client.sell(market, "yes", pos!.yesShares / 2n, 0n);
await client.redeem(market);                                     // after resolution
// raw instructions for custom tx composition: client.ixBuy / ixSell / ixRedeem / ...
```
Also: `listMarkets()`, `getFeed(tokenRef)`, `getVaultBalance(market)`, `parseEvents(logs)`, `priceYes(yes, no)`.

## 12. Centralized / mocked parts (to disclose in the pitch)

1. **Resolver = one devnet keypair** chosen at market creation; it alone can resolve. Nothing on-chain verifies the evidence — only its hash is committed. If it is offline, markets stay `open` forever (no timeout/void-by-anyone in this version).
2. **Price feed = `DemoFeed`**, written by a single demo authority (and by `scripts/scenario` scripts). Not a real oracle. The resolver reads it through a pluggable `Provider` interface (`MockProvider` default).
3. **Collateral = test token** minted by us, with a faucet script. Worthless.
4. **Void ≠ refund** (see §4). **Creator** receives the pool residual (winning-side reserve + fees).
5. `token_ref` is an opaque pubkey, not verified to be a real mint.
