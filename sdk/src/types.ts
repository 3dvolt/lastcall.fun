import type { PublicKey } from "@solana/web3.js";

export type Side = "yes" | "no";
export type Outcome = "yes" | "no" | "void";
export type MarketStatus = "open" | "resolvedYes" | "resolvedNo" | "void";
export type SourceKind = "demoFeed" | "pumpSwap";

/** All u64 values are bigint; timestamps are bigint seconds. Collateral/price/threshold: 6 decimals. */
export interface MarketAccount {
  address: PublicKey;
  creator: PublicKey;
  marketId: bigint;
  collateralMint: PublicKey;
  vault: PublicKey;
  tokenRef: PublicKey;
  threshold: bigint;
  expiryTs: bigint;
  resolutionWindowSecs: number;
  sampleIntervalSecs: number;
  sampleSlots: number;
  /** minimum median liquidity (USD6) required in the window */
  minLiquidityUsd: bigint;
  /** demo-feed markets only; default pubkey for PumpSwap */
  oracleAuthority: PublicKey;
  sourceKind: SourceKind;
  /** the PumpSwap pool (or the demo feed PDA) the program reads prices from */
  sourcePool: PublicKey;
  status: MarketStatus;
  yesReserve: bigint;
  noReserve: bigint;
  totalMinted: bigint;
  feeBps: number;
  feesAccrued: bigint;
  voidYesPrice: bigint;
  voidNoPrice: bigint;
  userObligation: bigint;
  residualClaimed: boolean;
  /** how it resolved: all computed on-chain from the samples */
  resSamples: number;
  resAbove: number;
  resTwap: bigint;
  resLiqMedian: bigint;
}

export interface SampleBufferAccount {
  market: PublicKey;
  count: number;
  /** per slot (length = market.sampleSlots) */
  mcap: bigint[];
  liquidity: bigint[];
  filled: boolean[];
}

export interface PositionAccount {
  address: PublicKey;
  market: PublicKey;
  user: PublicKey;
  yesShares: bigint;
  noShares: bigint;
  redeemed: boolean;
}

export interface FeedAccount {
  address: PublicKey;
  tokenRef: PublicKey;
  price: bigint;
  circulatingSupply: bigint;
  liquidityUsd: bigint;
  updatedTs: bigint;
  authority: PublicKey;
}

export interface CreateMarketParams {
  marketId: bigint | number;
  tokenRef: PublicKey;
  /** USD, 6 decimals (1_000_000_000_000 == $1,000,000) */
  threshold: bigint | number;
  expiryTs: bigint | number;
  resolutionWindowSecs: number;
  /** seconds per sample slot (window / interval = 6..120 slots) */
  sampleIntervalSecs: number;
  /** USD6, at least $5,000 */
  minLiquidityUsd: bigint | number;
  /** collateral base units (6 decimals) */
  initialLiquidity: bigint | number;
  feeBps: number;
  collateralMint: PublicKey;
  /** PRODUCTION: a SOL-quoted PumpSwap pool of `tokenRef` (use findPumpPools). TEST builds: demo feed. */
  source: { kind: "pumpSwap"; pool: PublicKey } | { kind: "demoFeed"; oracleAuthority: PublicKey };
  /** creator's collateral token account; defaults to the creator's ATA */
  creatorCollateral?: PublicKey;
}
