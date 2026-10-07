import { PublicKey } from "@solana/web3.js";
import { evidenceHash } from "./canonical.js";
import type { Evidence, EvalParams, OutcomeName, Sample } from "./types.js";

export interface EvalInput {
  market: PublicKey;
  tokenRef: PublicKey;
  threshold: bigint;
  expiryTs: number;
  windowSecs: number;
  samples: Sample[];
  params: EvalParams;
  feed: { address: PublicKey; authority: PublicKey };
}

const bmin = (a: bigint[]) => a.reduce((x, y) => (y < x ? y : x));
const bmax = (a: bigint[]) => a.reduce((x, y) => (y > x ? y : x));
const lowerMedian = (a: bigint[]): bigint => {
  const s = [...a].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return s[(s.length - 1) >> 1];
};

/**
 * Anti-manipulation resolution rule. Pure function of its input.
 *  1. VOID  if median(liquidity) < minLiquidity OR coverage < minCoverage   (checked first)
 *  2. YES   if TWAP(marketCap) >= threshold AND >= minSustainedFraction of samples >= threshold
 *  3. NO    otherwise
 * Window = [expiry - windowSecs, expiry). Stale samples (provider data too old) are excluded.
 * TWAP: each sample is held until the next sample; the last one until the window end.
 */
export function evaluate(inp: EvalInput): Evidence {
  const { params: p } = inp;
  const startTs = inp.expiryTs - inp.windowSecs;
  const endTs = inp.expiryTs;
  const inWindow = inp.samples.filter((s) => s.ts >= startTs && s.ts < endTs).sort((a, b) => a.ts - b.ts);
  const valid = inWindow.filter((s) => !s.stale);
  const n = valid.length;
  const expected = Math.max(1, Math.floor(inp.windowSecs / p.sampleIntervalSecs));

  const [cn, cd] = p.minCoverage;
  const coverageOk = n * cd >= expected * cn; // n/expected >= cn/cd, exact integer test
  const coverage = Math.min(1, n / expected);

  let medLiq = 0n, minLiq = 0n, minCap = 0n, maxCap = 0n, medCap = 0n, twap = 0n, above = 0;
  if (n > 0) {
    const liqs = valid.map((s) => s.liquidityUsd);
    const caps = valid.map((s) => s.marketCap);
    medLiq = lowerMedian(liqs);
    minLiq = bmin(liqs);
    minCap = bmin(caps);
    maxCap = bmax(caps);
    medCap = lowerMedian(caps);
    let wSum = 0n, acc = 0n;
    for (let i = 0; i < n; i++) {
      const until = i + 1 < n ? valid[i + 1].ts : endTs;
      const w = BigInt(Math.max(0, until - valid[i].ts));
      acc += valid[i].marketCap * w;
      wSum += w;
    }
    twap = wSum > 0n ? acc / wSum : caps.reduce((a, b) => a + b, 0n) / BigInt(n);
    above = valid.filter((s) => s.marketCap >= inp.threshold).length;
  }
  const liquidityOk = n > 0 && medLiq >= p.minLiquidityUsd;
  const [sn, sd] = p.minSustainedFraction;
  const twapOk = n > 0 && twap >= inp.threshold;
  const sustainedOk = n > 0 && above * sd >= n * sn;

  let outcome: OutcomeName;
  let reason: string;
  if (!liquidityOk || !coverageOk) {
    outcome = "void";
    reason = !coverageOk
      ? `sample coverage ${(coverage * 100).toFixed(1)}% below ${(cn / cd) * 100}%`
      : `median liquidity ${medLiq} below minimum ${p.minLiquidityUsd}`;
  } else if (twapOk && sustainedOk) {
    outcome = "yes";
    reason = `TWAP ${twap} >= threshold and ${above}/${n} samples >= threshold`;
  } else {
    outcome = "no";
    reason = !twapOk
      ? `TWAP ${twap} below threshold ${inp.threshold}`
      : `only ${above}/${n} samples >= threshold (need ${(sn / sd) * 100}%): not sustained`;
  }

  const ev: Evidence = {
    version: 1,
    market: inp.market.toBase58(),
    tokenRef: inp.tokenRef.toBase58(),
    threshold: inp.threshold.toString(),
    expiryTs: inp.expiryTs,
    window: { startTs, endTs, secs: inp.windowSecs },
    parameters: {
      minLiquidityUsd: p.minLiquidityUsd.toString(),
      minCoverage: cn / cd,
      minSustainedFraction: sn / sd,
      sampleIntervalSecs: p.sampleIntervalSecs,
      maxStalenessSecs: p.maxStalenessSecs,
      medianRule: "lower-median",
      twapRule: "step-hold-last",
    },
    samples: {
      count: n,
      staleExcluded: inWindow.length - n,
      expected,
      coverage,
      aboveThresholdFraction: n > 0 ? above / n : 0,
      marketCap: { min: minCap.toString(), max: maxCap.toString(), median: medCap.toString(), twap: twap.toString() },
      liquidity: { min: minLiq.toString(), median: medLiq.toString() },
      series: valid.map((s) => [s.ts, s.marketCap.toString()] as [number, string]),
    },
    rules: { liquidityOk, coverageOk, twapAtLeastThreshold: twapOk, sustainedAtLeastMinFraction: sustainedOk },
    outcome,
    reason,
    feed: { address: inp.feed.address.toBase58(), authority: inp.feed.authority.toBase58() },
  };
  ev.hash = evidenceHash(ev).toString("hex");
  return ev;
}
