/**
 * BigInt mirror of programs/lifecycle_markets/src/sources.rs (PumpSwap pool + Pyth SOL/USD), plus on-chain readers.
 * Everything is derived from public accounts: no API, no oracle service of ours.
 */
import { PublicKey, type Connection } from "@solana/web3.js";
import { MAX_ORACLE_AGE_SECS } from "./constants.js";

export const PUMPSWAP_PROGRAM = new PublicKey("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
export const WSOL_MINT = new PublicKey("So11111111111111111111111111111111111111112");
export const PYTH_SOL_USD_ACCOUNT = new PublicKey("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
const PYTH_SOL_USD_FEED_ID = "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const POOL_DISC = "f19a6d0411b16dbc";
const PYTH_DISC = "22f123639d7ef4cd";

const u64 = (d: Uint8Array, o: number) => Buffer.from(d).readBigUInt64LE(o);
const pk = (d: Uint8Array, o: number) => new PublicKey(d.slice(o, o + 32));

export interface PumpPool { baseMint: PublicKey; quoteMint: PublicKey; baseVault: PublicKey; quoteVault: PublicKey }

export function parsePool(d: Uint8Array): PumpPool {
  if (d.length < 203 || Buffer.from(d.slice(0, 8)).toString("hex") !== POOL_DISC) throw new Error("not a PumpSwap pool");
  return { baseMint: pk(d, 43), quoteMint: pk(d, 75), baseVault: pk(d, 139), quoteVault: pk(d, 171) };
}
export const parseTokenAmount = (d: Uint8Array): bigint => u64(d, 64);
export const parseMint = (d: Uint8Array) => ({ supply: u64(d, 36), decimals: d[44] });

/** USD per 1 SOL scaled by 1e6, from a Pyth PriceUpdateV2 account. Throws if stale/invalid (same checks as the program). */
export function parsePythSolUsd(d: Uint8Array, nowSecs: number): bigint {
  const b = Buffer.from(d);
  if (b.length < 101 || b.subarray(0, 8).toString("hex") !== PYTH_DISC) throw new Error("not a Pyth price update");
  if (b[40] !== 1 || b.subarray(41, 73).toString("hex") !== PYTH_SOL_USD_FEED_ID) throw new Error("not the verified SOL/USD feed");
  const price = b.readBigInt64LE(73), conf = b.readBigUInt64LE(81), expo = b.readInt32LE(89), publish = Number(b.readBigInt64LE(93));
  if (price <= 0n || expo < -12 || expo > 0) throw new Error("invalid Pyth price");
  if (publish > nowSecs + 10 || nowSecs - publish > MAX_ORACLE_AGE_SECS) throw new Error("stale Pyth price");
  if (conf * 10_000n > price * 200n) throw new Error("Pyth confidence too wide");
  const shift = 6 + expo;
  return shift >= 0 ? price * 10n ** BigInt(shift) : price / 10n ** BigInt(-shift);
}

/** market cap and liquidity in USD6 from raw reserves (decimals cancel out). Mirrors `pump_quote`. */
export function pumpQuote(baseReserve: bigint, quoteReserveLamports: bigint, supplyRaw: bigint, usdPerSol6: bigint): { marketCap: bigint; liquidity: bigint } {
  if (baseReserve === 0n || quoteReserveLamports === 0n || usdPerSol6 === 0n) throw new Error("empty pool");
  const perUnit = (supplyRaw * quoteReserveLamports) / baseReserve;
  return { marketCap: (perUnit * usdPerSol6) / 1_000_000_000n, liquidity: (quoteReserveLamports * 2n * usdPerSol6) / 1_000_000_000n };
}

export interface PumpQuote { marketCap: bigint; liquidity: bigint; priceUsd: number; usdPerSol: number; accounts: PublicKey[] }

/** Reads a PumpSwap pool straight from the chain and prices it exactly like the program does at sampling time. */
export async function readPumpQuote(conn: Connection, pool: PublicKey, nowSecs = Math.floor(Date.now() / 1000)): Promise<PumpQuote> {
  const poolInfo = await conn.getAccountInfo(pool, "confirmed");
  if (!poolInfo || !poolInfo.owner.equals(PUMPSWAP_PROGRAM)) throw new Error("not a PumpSwap pool account");
  const p = parsePool(poolInfo.data);
  if (!p.quoteMint.equals(WSOL_MINT)) throw new Error("only SOL-quoted pools are supported");
  const [bv, qv, mint, pyth] = await conn.getMultipleAccountsInfo([p.baseVault, p.quoteVault, p.baseMint, PYTH_SOL_USD_ACCOUNT], "confirmed");
  if (!bv || !qv || !mint || !pyth) throw new Error("pool accounts missing");
  const usdPerSol6 = parsePythSolUsd(pyth.data, nowSecs);
  const base = parseTokenAmount(bv.data), quote = parseTokenAmount(qv.data), { supply, decimals } = parseMint(mint.data);
  const { marketCap, liquidity } = pumpQuote(base, quote, supply, usdPerSol6);
  const priceUsd = (Number(quote) / 1e9 / (Number(base) / 10 ** decimals)) * (Number(usdPerSol6) / 1e6);
  return { marketCap, liquidity, priceUsd, usdPerSol: Number(usdPerSol6) / 1e6, accounts: [pool, p.baseVault, p.quoteVault, p.baseMint, PYTH_SOL_USD_ACCOUNT] };
}

export interface FoundPool { pool: PublicKey; quoteReserve: bigint }

/** All SOL-quoted PumpSwap pools of a token, deepest first. One getProgramAccounts call (filtered by size and mint). */
export async function findPumpPools(conn: Connection, tokenMint: PublicKey): Promise<FoundPool[]> {
  const pools = await conn.getProgramAccounts(PUMPSWAP_PROGRAM, {
    commitment: "confirmed",
    filters: [{ dataSize: 301 }, { memcmp: { offset: 43, bytes: tokenMint.toBase58() } }, { memcmp: { offset: 75, bytes: WSOL_MINT.toBase58() } }],
  });
  const parsed = pools.map((a) => ({ pool: a.pubkey, p: parsePool(a.account.data) }));
  if (parsed.length === 0) return [];
  const vaults = await conn.getMultipleAccountsInfo(parsed.map((x) => x.p.quoteVault), "confirmed");
  return parsed
    .map((x, i) => ({ pool: x.pool, quoteReserve: vaults[i] ? parseTokenAmount(vaults[i]!.data) : 0n }))
    .sort((a, b) => (a.quoteReserve < b.quoteReserve ? 1 : a.quoteReserve > b.quoteReserve ? -1 : 0));
}
