/**
 * BigInt mirror of programs/lifecycle_markets/src/math.rs. Must stay bit-for-bit identical
 * (verified against Rust-generated vectors in test/math.test.ts).
 */
import { BPS_DENOM, MAX_RESERVE, PRICE_SCALE } from "./constants.js";

export class MathError extends Error {}

export interface BuyQuote {
  fee: bigint;
  net: bigint;
  sharesOut: bigint;
  /** reserve of the bought side after the trade */
  newOwn: bigint;
  /** reserve of the opposite side after the trade */
  newOther: bigint;
}

export interface SellQuote {
  /** collateral released from the pool before fee */
  gross: bigint;
  fee: bigint;
  /** collateral the seller receives */
  payout: bigint;
  newOwn: bigint;
  newOther: bigint;
}

export const ceilDiv = (a: bigint, b: bigint): bigint => {
  if (b === 0n) throw new MathError("division by zero");
  return (a + b - 1n) / b;
};

export const feeOf = (amount: bigint, feeBps: number): bigint => ceilDiv(amount * BigInt(feeBps), BPS_DENOM);

export function isqrtFloor(x: bigint): bigint {
  if (x < 2n) return x;
  let r = 1n << BigInt((x.toString(2).length + 1) >> 1);
  for (;;) {
    const next = (r + x / r) >> 1n;
    if (next >= r) return r;
    r = next;
  }
}

export function isqrtCeil(x: bigint): bigint {
  const f = isqrtFloor(x);
  return f * f === x ? f : f + 1n;
}

/** Buy shares of a side. `own` = reserve of the side being bought, `other` = opposite reserve. */
export function quoteBuy(own: bigint, other: bigint, amount: bigint, feeBps: number): BuyQuote {
  if (amount <= 0n) throw new MathError("zero amount");
  const fee = feeOf(amount, feeBps);
  const net = amount - fee;
  if (net <= 0n) throw new MathError("zero amount");
  const newOwnPre = own + net;
  const newOther = other + net;
  if (newOwnPre > MAX_RESERVE || newOther > MAX_RESERVE) throw new MathError("reserve too large");
  const ownAfter = ceilDiv(own * other, newOther);
  const sharesOut = newOwnPre - ownAfter;
  if (sharesOut <= 0n) throw new MathError("zero amount");
  return { fee, net, sharesOut, newOwn: ownAfter, newOther };
}

/** Sell shares of a side back to the pool. */
export function quoteSell(own: bigint, other: bigint, shares: bigint, feeBps: number): SellQuote {
  if (shares <= 0n) throw new MathError("zero amount");
  const sum = own + shares + other;
  if (sum > 3n * MAX_RESERVE) throw new MathError("reserve too large");
  const disc = sum * sum - 4n * shares * other;
  const root = isqrtCeil(disc);
  const gross = (sum - root) / 2n;
  if (gross <= 0n) throw new MathError("zero amount");
  if (gross >= other) throw new MathError("insufficient reserve");
  const newOwn = own + shares - gross;
  const newOther = other - gross;
  if (newOwn * newOther < own * other) throw new MathError("invariant violated");
  const fee = feeOf(gross, feeBps);
  return { gross, fee, payout: gross - fee, newOwn, newOther };
}

/** Marginal Void prices, scaled by PRICE_SCALE and rounded down: [yes, no]. */
export function voidPrices(yesReserve: bigint, noReserve: bigint): [bigint, bigint] {
  const den = yesReserve + noReserve;
  if (den === 0n) throw new MathError("empty pool");
  return [(noReserve * PRICE_SCALE) / den, (yesReserve * PRICE_SCALE) / den];
}

export const voidPayout = (yesShares: bigint, noShares: bigint, pYes: bigint, pNo: bigint): bigint =>
  (yesShares * pYes) / PRICE_SCALE + (noShares * pNo) / PRICE_SCALE;

/** Marginal price of YES in [0,1] as a float (display only). price_yes = n / (y + n). */
export const priceYes = (yesReserve: bigint, noReserve: bigint): number =>
  Number((noReserve * 1_000_000_000_000n) / (yesReserve + noReserve)) / 1e12;
export const priceNo = (yesReserve: bigint, noReserve: bigint): number => 1 - priceYes(yesReserve, noReserve);
