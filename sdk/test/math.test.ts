import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { MathError, isqrtCeil, isqrtFloor, quoteBuy, quoteSell, voidPayout, voidPrices } from "../src/index.js";

const vectors = JSON.parse(readFileSync(new URL("./vectors.json", import.meta.url), "utf8"));
const B = (s: string) => BigInt(s);

describe("TS quotes match Rust (programs/lifecycle_markets/src/math.rs) bit for bit", () => {
  it("buy", () => {
    for (const v of vectors.buys) {
      if (!v.ok) { expect(() => quoteBuy(B(v.own), B(v.other), B(v.amount), v.feeBps)).toThrow(MathError); continue; }
      const q = quoteBuy(B(v.own), B(v.other), B(v.amount), v.feeBps);
      expect([q.fee, q.net, q.sharesOut, q.newOwn, q.newOther]).toEqual([v.fee, v.net, v.sharesOut, v.newOwn, v.newOther].map(B));
    }
  });
  it("sell", () => {
    for (const v of vectors.sells) {
      if (!v.ok) { expect(() => quoteSell(B(v.own), B(v.other), B(v.shares), v.feeBps)).toThrow(MathError); continue; }
      const q = quoteSell(B(v.own), B(v.other), B(v.shares), v.feeBps);
      expect([q.gross, q.fee, q.payout, q.newOwn, q.newOther]).toEqual([v.gross, v.fee, v.payout, v.newOwn, v.newOther].map(B));
    }
  });
  it("void", () => {
    for (const v of vectors.voids) {
      const [py, pn] = voidPrices(B(v.y), B(v.n));
      expect([py, pn]).toEqual([B(v.pYes), B(v.pNo)]);
      expect(voidPayout(B(v.yesShares), B(v.noShares), py, pn)).toBe(B(v.payout));
    }
  });
});

describe("isqrt", () => {
  it("is exact", () => {
    for (let x = 0n; x < 3000n; x++) {
      const f = isqrtFloor(x), c = isqrtCeil(x);
      expect(f * f <= x && (f + 1n) * (f + 1n) > x).toBe(true);
      expect(c * c >= x && (c === 0n || (c - 1n) * (c - 1n) < x)).toBe(true);
    }
    const big = (1n << 120n) + 12345n;
    expect(isqrtFloor(big * big)).toBe(big);
    expect(isqrtCeil(big * big + 1n)).toBe(big + 1n);
  });
});

describe("worked example", () => {
  it("y=n=1000, buy 100 -> 190 shares", () => {
    const q = quoteBuy(1000n, 1000n, 100n, 0);
    expect(q.sharesOut).toBe(190n);
    expect([q.newOwn, q.newOther]).toEqual([910n, 1100n]);
  });
  it("rejects zero / oversize", () => {
    expect(() => quoteBuy(1000n, 1000n, 0n, 0)).toThrow(MathError);
    expect(() => quoteBuy(1n << 62n, 1000n, 1n, 0)).toThrow(MathError);
  });
});
