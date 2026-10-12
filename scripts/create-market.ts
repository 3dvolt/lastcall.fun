/**
 * Creates a market on a real token: the program prices it from the token's PumpSwap pool, on-chain.
 *   NETWORK=mainnet npm run create-market -- --mint <token mint> --threshold <USD market cap> [--duration 86400] [--window 300] [--interval 10] [--min-liquidity 10000] [--liquidity 100] [--fee 100]
 * Picks the DEEPEST SOL pool of the token, shows what the program will read, and only then sends the transaction.
 * The collateral mint is COLLATERAL_MINT (env). Mainnet: you pay with your own wallet (CREATOR_KEYPAIR), nothing is automatic.
 */
import { findPumpPools, makeConnection, readPumpQuote, MIN_LIQUIDITY_FLOOR_USD } from "@lifecycle-markets/sdk";
import { PublicKey } from "@solana/web3.js";
import { clientFor, connect, env, fmt6, readKeypair, usd } from "./common.js";

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const mintArg = opt("mint"), thresholdArg = opt("threshold");
if (!mintArg || !thresholdArg) { console.error("usage: npm run create-market -- --mint <mint> --threshold <USD> [--duration s] [--window s] [--interval s] [--min-liquidity USD] [--liquidity tokens] [--fee bps]"); process.exit(2); }
const duration = Number(opt("duration", "86400")), windowSecs = Number(opt("window", "300")), interval = Number(opt("interval", "10"));
const minLiq = Number(opt("min-liquidity", "10000")), liquidity = Number(opt("liquidity", "100")), feeBps = Number(opt("fee", "100"));

const { conn, cluster } = await connect();
const tokenRef = new PublicKey(mintArg);
const listConn = process.env.LIST_RPC_URL ? makeConnection(process.env.LIST_RPC_URL) : cluster === "mainnet" ? makeConnection("https://api.mainnet-beta.solana.com") : conn; // getProgramAccounts: public RPC
const pools = await findPumpPools(listConn, tokenRef);
if (pools.length === 0) { console.error("No SOL-quoted PumpSwap pool found for this token on this network."); process.exit(1); }
const pool = pools[0];
const q = await readPumpQuote(conn, pool.pool);
console.log(`pool ${pool.pool.toBase58()} (${pools.length} found, deepest chosen)`);
console.log(`the program will read: market cap $${fmt6(q.marketCap)}, liquidity $${fmt6(q.liquidity)}, SOL/USD $${q.usdPerSol.toFixed(2)}`);
if (usd(minLiq) < MIN_LIQUIDITY_FLOOR_USD) { console.error("--min-liquidity must be at least $5,000"); process.exit(1); }
if (q.liquidity < usd(minLiq)) { console.error(`Pool liquidity is below your minimum ($${minLiq}): the market would resolve VOID. Aborting.`); process.exit(1); }
if (pools.length > 1) console.log(`note: ${pools.length - 1} other pool(s) exist; this market only follows the deepest one`);

const creator = readKeypair(env("CREATOR_KEYPAIR"));
const { market } = await clientFor(conn, creator).createMarket({
  marketId: BigInt(Date.now()), tokenRef, threshold: usd(Number(thresholdArg)), expiryTs: Math.floor(Date.now() / 1000) + duration,
  resolutionWindowSecs: windowSecs, sampleIntervalSecs: interval, minLiquidityUsd: usd(minLiq), initialLiquidity: usd(liquidity), feeBps,
  collateralMint: new PublicKey(env("COLLATERAL_MINT")), source: { kind: "pumpSwap", pool: pool.pool },
});
console.log(`created on ${cluster}: ${market.toBase58()}`);
