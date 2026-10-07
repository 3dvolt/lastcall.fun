import { PublicKey } from "@solana/web3.js";
import idl from "./idl/lifecycle_markets.json" with { type: "json" };

/** Default program id (devnet). Override via `new LifecycleClient(provider, programId)`. */
export const PROGRAM_ID = new PublicKey(idl.address);

export const MARKET_SEED = Buffer.from("market");
export const VAULT_SEED = Buffer.from("vault");
export const POSITION_SEED = Buffer.from("position");
export const FEED_SEED = Buffer.from("feed");

/** Void redemption prices are fixed point with this scale (1.0 == 1e9). */
export const PRICE_SCALE = 1_000_000_000n;
export const BPS_DENOM = 10_000n;
export const MAX_FEE_BPS = 1_000;
/** Reserves / total_minted are capped at 2^62 on-chain. */
export const MAX_RESERVE = 1n << 62n;
/** Collateral token, prices and thresholds all use 6 decimals. */
export const USD_DECIMALS = 6;
export const COLLATERAL_DECIMALS = 6;
