import type { PublicKey } from "@solana/web3.js";

export type Side = "yes" | "no";
export type Outcome = "yes" | "no" | "void";
export type MarketStatus = "open" | "resolvedYes" | "resolvedNo" | "void";

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
  resolver: PublicKey;
  status: MarketStatus;
  yesReserve: bigint;
  noReserve: bigint;
  totalMinted: bigint;
  feeBps: number;
  feesAccrued: bigint;
  /** hex string (64 chars); all zeros until resolved */
  evidenceHash: string;
  voidYesPrice: bigint;
  voidNoPrice: bigint;
  userObligation: bigint;
  residualClaimed: boolean;
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
  /** collateral base units (6 decimals) */
  initialLiquidity: bigint | number;
  feeBps: number;
  collateralMint: PublicKey;
  resolver: PublicKey;
  /** creator's collateral token account; defaults to the creator's ATA */
  creatorCollateral?: PublicKey;
}
