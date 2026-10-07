# Vulnerability assessment (devnet demo) — 2026-10-07

Scope: Anchor program, resolver service, faucet server, SDK, web UI, dependencies. Method: manual code review + live proof for the critical finding + `npm audit` + the existing test suites. Not a formal audit; no fuzzing of the program beyond the randomized solvency tests.

## Fixed in this pass
| ID | Sev | Finding | Fix |
|---|---|---|---|
| S1 | **Critical** | Path traversal in resolver API: `/markets/<id>/evidence` used `id` as a file name, so `..%2F..%2Fkeys%2Fresolver` returned any `.json` file, including the resolver's secret key. Reproduced. | Market ids must be base58 pubkeys (store + `app.param`), regression test `resolver/test/security.test.ts` |
| S2 | High | UI listed every market on the program, including ones created by anyone with their own resolver or collateral token (creator could decide the outcome). | UI only shows/trades markets whose resolver = `VITE_RESOLVER_PUBKEY` and mint = `VITE_COLLATERAL_MINT`; others open read-only with a warning |
| S3 | Medium | Create form took the resolver key from the API (`/health`), so a hijacked API could make users create markets with an attacker resolver. | Resolver key pinned at build time; API only used as a consistency check |
| S4 | Medium | A collateral mint with a freeze authority could freeze the vault and lock all funds. | Program rejects such mints (`InvalidCollateralMint`, test added) — requires redeploying the program |
| S5 | Medium | Faucet: only per-wallet limit, so many wallets drain the faucet's SOL (it pays ATA rent). | per-IP (3/h) and global (60/h) caps, 1 kB body limit |
| S6 | Low | Resolver API had no rate limit / nosniff / no-store. | in-memory per-IP limit (120/min), headers |
| S7 | Medium | Anyone can create markets naming our resolver as resolver, forcing it to sample and pay fees to resolve spam (SOL drain). | optional `ALLOWED_CREATORS` allowlist |

## Open (decide / accept)
| ID | Sev | Finding | Recommendation |
|---|---|---|---|
| O1 | High (by design) | Single resolver key can resolve any outcome; nothing on-chain verifies evidence. Key compromise = market takeover. | Disclose; keep key off the web host (separate machine/secret manager); for beyond-demo use multisig / optimistic dispute window / oracle |
| O2 | Medium | No liveness fallback: if the resolver is down, funds stay locked. | Permissionless Void after expiry + grace period (needs program change) |
| O3 | Medium | Program is upgradeable by the deployer key. | Multisig, then revoke the upgrade authority before any real use |
| O4 | Medium | `DemoFeed` first-writer-becomes-authority; feed is mock. | Resolver already pins `DEMO_AUTHORITY`; replace with a real oracle |
| O5 | Medium | Void pays the final marginal price, not a refund. | Product decision / disclose |
| O6 | Low | Dependencies: `npm audit` lists 5 high / 7 moderate. High ones come from `@solana/web3.js` 1.x → `bigint-buffer` (buffer overflow in `toBigIntLE`, we do not call it with untrusted input), `toml` (Anchor TS, build-time), and the react-native/metro tree pulled in by the wallet-adapter *mobile* package (not bundled in the web build). No fix available upstream. | Accept for devnet; re-audit before launch; consider `@solana/kit` migration |
| O7 | Low | CSP uses `style-src 'unsafe-inline'` (wallet modal); `frame-ancestors` cannot be set by meta tag. | Send CSP and security headers from the host (see `web` README / `amplify.yml`) |
| O8 | Low | Slippage/sandwich: mitigated by min-out; priority fees not set. | Optional |

## Checked and OK
Checked arithmetic and rounding in favour of the pool (property tests, 75 randomized sequences, vault == minted + fees at every step); PDA seeds and `has_one`/signer checks on every instruction; double redeem / double claim; resolve only by resolver after expiry; creator residual cannot touch user obligations; no secrets in repo (`keys/`, `.env` gitignored); React escapes all output, no `dangerouslySetInnerHTML`; evidence hash independently re-verified in the browser.
