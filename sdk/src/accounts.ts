import type { PublicKey } from "@solana/web3.js";
import type { BN } from "@anchor-lang/core";
import type { FeedAccount, MarketAccount, MarketStatus, PositionAccount } from "./types.js";

const big = (x: BN | bigint | number): bigint => BigInt(x.toString());

const statusOf = (s: object): MarketStatus => {
  const k = Object.keys(s)[0];
  switch (k) {
    case "open": return "open";
    case "resolvedYes": return "resolvedYes";
    case "resolvedNo": return "resolvedNo";
    case "void": return "void";
    default: throw new Error(`unknown market status ${k}`);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseMarket(address: PublicKey, a: any): MarketAccount {
  return {
    address,
    creator: a.creator,
    marketId: big(a.marketId),
    collateralMint: a.collateralMint,
    vault: a.vault,
    tokenRef: a.tokenRef,
    threshold: big(a.threshold),
    expiryTs: big(a.expiryTs),
    resolutionWindowSecs: Number(a.resolutionWindowSecs),
    resolver: a.resolver,
    status: statusOf(a.status),
    yesReserve: big(a.yesReserve),
    noReserve: big(a.noReserve),
    totalMinted: big(a.totalMinted),
    feeBps: Number(a.feeBps),
    feesAccrued: big(a.feesAccrued),
    evidenceHash: Buffer.from(a.evidenceHash).toString("hex"),
    voidYesPrice: big(a.voidYesPrice),
    voidNoPrice: big(a.voidNoPrice),
    userObligation: big(a.userObligation),
    residualClaimed: Boolean(a.residualClaimed),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePosition(address: PublicKey, a: any): PositionAccount {
  return {
    address,
    market: a.market,
    user: a.user,
    yesShares: big(a.yesShares),
    noShares: big(a.noShares),
    redeemed: Boolean(a.redeemed),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseFeed(address: PublicKey, a: any): FeedAccount {
  return {
    address,
    tokenRef: a.tokenRef,
    price: big(a.price),
    circulatingSupply: big(a.circulatingSupply),
    liquidityUsd: big(a.liquidityUsd),
    updatedTs: big(a.updatedTs),
    authority: a.authority,
  };
}
