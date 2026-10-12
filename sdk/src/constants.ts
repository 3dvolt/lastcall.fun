import { PublicKey } from "@solana/web3.js";
import idl from "./idl/lifecycle_markets.json" with { type: "json" };

/** Default program id (devnet). Override via `new LifecycleClient(provider, programId)`. */
export const PROGRAM_ID = new PublicKey(idl.address);

export const MARKET_SEED = Buffer.from("market");
export const VAULT_SEED = Buffer.from("vault");
export const POSITION_SEED = Buffer.from("position");
export const FEED_SEED = Buffer.from("feed");
export const SAMPLES_SEED = Buffer.from("samples");

/** Void redemption prices are fixed point with this scale (1.0 == 1e9). */
export const PRICE_SCALE = 1_000_000_000n;
export const BPS_DENOM = 10_000n;
export const MAX_FEE_BPS = 1_000;
/** Reserves / total_minted are capped at 2^62 on-chain. */
export const MAX_RESERVE = 1n << 62n;
/** Collateral token, prices and thresholds all use 6 decimals. */
export const USD_DECIMALS = 6;
export const COLLATERAL_DECIMALS = 6;

export const MIN_LIQUIDITY_FLOOR_USD = 5_000_000_000n; // $5,000 (USD6): enforced by the program
export const MAX_SLOTS = 120;
export const MIN_SLOTS = 6;
export const MIN_INTERVAL_SECS = 5;
/** Pyth SOL/USD may be at most this old (seconds) when a sample is recorded. */
export const MAX_ORACLE_AGE_SECS = 300;

/** Program error code -> message, straight from the IDL (never out of sync with the deployed program). */
export const PROGRAM_ERRORS: Record<number, string> = Object.fromEntries(
  (idl as { errors: Array<{ code: number; msg: string }> }).errors.map((e) => [e.code, e.msg]),
);
export const PROGRAM_ERROR_NAMES: Record<number, string> = Object.fromEntries(
  (idl as { errors: Array<{ code: number; name: string }> }).errors.map((e) => [e.code, e.name]),
);
