/**
 * Seeds 4 long-running showcase markets on the current cluster (different thresholds / expiries / odds), each with a feed value
 * and a little trading so the UI has something to show. Idempotent per label. Resolve them with the resolver service.
 *   npm run seed
 */
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { clientFor, connect, ensureSol, fmt6, loadDeployment, loadRole, saveDeployment, usd } from "./common.js";

const { conn, cluster } = await connect();
const dep = loadDeployment(cluster);
if (!dep.collateralMint) throw new Error("run `npm run create-collateral` first");
const mint = new PublicKey(dep.collateralMint);
const demo = loadRole("DEMO_AUTHORITY"), faucet = loadRole("FAUCET");
await Promise.all([ensureSol(conn, demo, 1), ensureSol(conn, faucet, 0.2)]);
const resolver = loadRole("RESOLVER").publicKey;
const client = clientFor(conn, demo);
await mintTo(conn, faucet, mint, (await getOrCreateAssociatedTokenAccount(conn, faucet, mint, demo.publicKey)).address, faucet, usd(10_000));

const now = Math.floor(Date.now() / 1000);
const seeds = [
  { label: "$PEPEX hits $1M mcap", threshold: 1_000_000, price: 0.72, supply: 1_000_000, liq: 180_000, hours: 24, yesBias: 60 },
  { label: "$MOONCAT hits $5M mcap", threshold: 5_000_000, price: 2.1, supply: 1_000_000, liq: 60_000, hours: 12, yesBias: 20 },
  { label: "$ZAPPY holds $250k mcap", threshold: 250_000, price: 0.31, supply: 1_000_000, liq: 90_000, hours: 6, yesBias: 90 },
  { label: "$GHOST hits $2M mcap", threshold: 2_000_000, price: 0.4, supply: 1_000_000, liq: 4_000, hours: 48, yesBias: 10 },
];
for (const s of seeds) {
  if (dep.markets.some((m) => m.label === s.label)) { console.log(`skip (exists): ${s.label}`); continue; }
  const tokenRef = Keypair.generate().publicKey;
  await client.demoSetFeed(tokenRef, usd(s.price), BigInt(s.supply), usd(s.liq));
  const marketId = BigInt(Date.now());
  const expiryTs = now + s.hours * 3600;
  const { market } = await client.createMarket({
    marketId, tokenRef, threshold: usd(s.threshold), expiryTs, resolutionWindowSecs: 300,
    initialLiquidity: usd(1000), feeBps: 100, collateralMint: mint, resolver,
  });
  const m = (await client.getMarket(market))!;
  await client.buy(m, "yes", usd(s.yesBias), 0n);
  const m2 = (await client.getMarket(market))!;
  await client.buy(m2, "no", usd(50), 0n);
  dep.markets.push({ id: `seed-${marketId}`, marketId: marketId.toString(), market: market.toBase58(), tokenRef: tokenRef.toBase58(), label: s.label, expiryTs, threshold: usd(s.threshold).toString() });
  saveDeployment(dep);
  const f = (await client.getMarket(market))!;
  console.log(`seeded "${s.label}" ${market.toBase58()} price_yes=${(Number(f.noReserve) / Number(f.yesReserve + f.noReserve)).toFixed(3)} liquidity ${fmt6(f.totalMinted)}`);
  await new Promise((r) => setTimeout(r, 50));
}
