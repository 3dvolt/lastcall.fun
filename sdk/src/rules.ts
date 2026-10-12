/** BigInt/number mirror of programs/lifecycle_markets/src/rules.rs: the rule the PROGRAM applies at resolution. */
export type Verdict = "yes" | "no" | "void";
export interface WindowStats { samples: number; above: number; twap: bigint; liqMedian: bigint }

/** Only the first `slots` entries count; `filled[i]` marks recorded slots. */
export function evaluateWindow(slots: number, mcap: bigint[], liq: bigint[], filled: boolean[], threshold: bigint, minLiquidity: bigint): { verdict: Verdict; stats: WindowStats } {
  const caps: bigint[] = [], liqs: bigint[] = [];
  for (let i = 0; i < slots; i++) if (filled[i]) { caps.push(mcap[i]); liqs.push(liq[i]); }
  const n = caps.length;
  const stats: WindowStats = { samples: n, above: 0, twap: 0n, liqMedian: 0n };
  if (n === 0) return { verdict: "void", stats };
  stats.twap = caps.reduce((a, b) => a + b, 0n) / BigInt(n);
  stats.above = caps.filter((c) => c >= threshold).length;
  const sorted = [...liqs].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  stats.liqMedian = sorted[(sorted.length - 1) >> 1]; // lower median
  const coverageOk = n * 5 >= slots * 4; // >= 80%
  const liquidityOk = stats.liqMedian >= minLiquidity;
  if (!coverageOk || !liquidityOk) return { verdict: "void", stats };
  const sustainedOk = stats.above * 10 >= n * 9; // >= 90%
  return { verdict: stats.twap >= threshold && sustainedOk ? "yes" : "no", stats };
}
