/**
 * Runs one demo scenario end to end against the DemoFeed:
 *   npm run scenario -- <organic_growth|pump_and_dump_attack|thin_liquidity|stays_below> [--duration 240] [--window 120] [--tick 5]
 * Creates a fresh market (threshold $1M, expiry = now + duration), places a few trades, drives the feed along the scenario
 * profile, waits for the resolver service (run it separately: `npm run resolver`), then redeems and claims and checks the outcome.
 * Exit code 1 if the on-chain outcome differs from the expected one (used by e2e-local).
 */
import { getAccount, getAssociatedTokenAddressSync, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { SCENARIO_EXPECTED, SCENARIO_NAMES, SCENARIO_SUPPLY, SCENARIO_THRESHOLD_USD6, scenarioFeed, type ScenarioName } from "../resolver/src/scenarios.js";
import { clientFor, connect, ensureSol, fmt6, loadDeployment, loadRole, sleep, usd, saveDeployment } from "./common.js";

const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith("--")) as ScenarioName | undefined;
const opt = (k: string, d: number) => { const i = args.indexOf(`--${k}`); return i >= 0 ? Number(args[i + 1]) : d; };
if (!name || !SCENARIO_NAMES.includes(name)) { console.error(`usage: npm run scenario -- <${SCENARIO_NAMES.join("|")}> [--duration s] [--window s] [--tick s]`); process.exit(2); }
const duration = opt("duration", 240), windowSecs = opt("window", 120), tick = opt("tick", 5);
if (windowSecs >= duration) { console.error("--window must be smaller than --duration"); process.exit(2); }

const { conn, cluster } = await connect();
const dep = loadDeployment(cluster);
if (!dep.collateralMint) throw new Error("run `npm run create-collateral` first");
const mint = new PublicKey(dep.collateralMint);
const demo = loadRole("DEMO_AUTHORITY"), faucet = loadRole("FAUCET");
const resolverPk = loadRole("RESOLVER").publicKey;
await Promise.all([ensureSol(conn, demo, 1), ensureSol(conn, faucet, 0.2)]);
const client = clientFor(conn, demo);
const log = (m: string) => console.log(`[${name}] ${m}`);

// 1. feed + market
const tokenRef = Keypair.generate().publicKey;
const feedAt = (secsToExpiry: number) => scenarioFeed(name, secsToExpiry, duration, windowSecs);
const nowS = () => Math.floor(Date.now() / 1000);
const expiryTs = nowS() + duration + 10; // +10s: room for setup
const pushFeed = async () => { const f = feedAt(expiryTs - nowS()); await client.demoSetFeed(tokenRef, f.price, f.circulatingSupply, f.liquidityUsd); return f; };
await pushFeed();
const demoAta = await getOrCreateAssociatedTokenAccount(conn, faucet, mint, demo.publicKey);
// random dust so concurrent scenario processes never produce byte-identical (deduplicated) transactions
await mintTo(conn, faucet, mint, demoAta.address, faucet, 2_000n * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000)));
const marketId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
const { market } = await client.createMarket({
  marketId, tokenRef, threshold: SCENARIO_THRESHOLD_USD6, expiryTs, resolutionWindowSecs: windowSecs,
  initialLiquidity: usd(1000), feeBps: 100, collateralMint: mint, resolver: resolverPk,
});
log(`market ${market.toBase58()} created, expires in ${expiryTs - nowS()}s, window ${windowSecs}s, expected ${SCENARIO_EXPECTED[name].toUpperCase()}`);
dep.markets.push({ id: `${name}-${marketId}`, marketId: marketId.toString(), market: market.toBase58(), tokenRef: tokenRef.toBase58(), label: name, scenario: name, expiryTs, threshold: SCENARIO_THRESHOLD_USD6.toString() });
saveDeployment(dep);

// 2. two traders with opposite views
const traders = [Keypair.generate(), Keypair.generate()];
for (const t of traders) {
  await sendAndConfirmTransaction(conn, new Transaction().add(SystemProgram.transfer({ fromPubkey: demo.publicKey, toPubkey: t.publicKey, lamports: 30_000_000 })), [demo]);
  const ata = await getOrCreateAssociatedTokenAccount(conn, faucet, mint, t.publicKey);
  await mintTo(conn, faucet, mint, ata.address, faucet, usd(500));
}
const [yesTrader, noTrader] = traders.map((t) => clientFor(conn, t));
let m = (await client.getMarket(market))!;
await yesTrader.buy(m, "yes", usd(100), 0n);
m = (await client.getMarket(market))!;
await noTrader.buy(m, "no", usd(60), 0n);
m = (await client.getMarket(market))!;
log(`trades placed: yes reserve ${fmt6(m.yesReserve)} no reserve ${fmt6(m.noReserve)}`);

// 3. drive the feed until expiry (+ a short post-expiry "dump" so the pump scenario reverts), then wait for the resolver
let lastLog = 0;
while (nowS() < expiryTs + Math.min(3 * tick, 15)) {
  const f = await pushFeed();
  if (Date.now() - lastLog > 15_000) { lastLog = Date.now(); log(`t-${expiryTs - nowS()}s market cap $${fmt6(f.price * SCENARIO_SUPPLY)} liquidity $${fmt6(f.liquidityUsd)}`); }
  await sleep(tick * 1000);
}
log("expired; waiting for the resolver service to resolve on-chain…");
const deadline = Date.now() + 5 * 60_000;
for (;;) {
  m = (await client.getMarket(market))!;
  if (m.status !== "open") break;
  if (Date.now() > deadline) { console.error("timed out waiting for resolution — is `npm run resolver` running?"); process.exit(1); }
  await sleep(3000);
}
const outcome = m.status === "resolvedYes" ? "yes" : m.status === "resolvedNo" ? "no" : "void";
log(`RESOLVED on-chain: ${outcome.toUpperCase()}  evidence hash ${m.evidenceHash}`);

// 4. redeem + claim
for (const [i, t] of traders.entries()) {
  const c = clientFor(conn, t);
  const ata = getAssociatedTokenAddressSync(mint, t.publicKey);
  const before = (await getAccount(conn, ata)).amount;
  await c.redeem(m);
  log(`${i === 0 ? "YES" : "NO "} trader redeemed: ${fmt6((await getAccount(conn, ata)).amount - before)} tokens`);
}
await client.claimResidual(m);
log(`creator claimed residual; vault balance now ${await client.getVaultBalance(m)} base units`);

const ok = outcome === SCENARIO_EXPECTED[name];
console.log(ok ? `PASS ${name} -> ${outcome}` : `FAIL ${name}: expected ${SCENARIO_EXPECTED[name]} got ${outcome}`);
process.exit(ok ? 0 : 1);
