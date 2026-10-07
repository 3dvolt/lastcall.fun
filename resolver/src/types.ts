export interface Sample {
  /** wall-clock unix seconds when the sampler read the provider */
  ts: number;
  price: bigint; // USD, 6 dec
  circulatingSupply: bigint; // whole tokens
  liquidityUsd: bigint; // USD, 6 dec
  marketCap: bigint; // price * circulatingSupply, USD 6 dec
  /** provider-side update time (unix s), if known */
  feedUpdatedTs?: number;
  /** true if the provider data was older than maxStalenessSecs at read time; stale samples are ignored by the evaluator */
  stale?: boolean;
}

export interface EvalParams {
  minLiquidityUsd: bigint;
  /** coverage and sustained fractions as exact integer ratios [num, den] */
  minCoverage: [number, number];
  minSustainedFraction: [number, number];
  sampleIntervalSecs: number;
  maxStalenessSecs: number;
}

export const DEFAULT_PARAMS: EvalParams = {
  minLiquidityUsd: 10_000_000_000n, // $10,000
  minCoverage: [4, 5], // 80%
  minSustainedFraction: [9, 10], // 90%
  sampleIntervalSecs: 10,
  maxStalenessSecs: 30,
};

export type OutcomeName = "yes" | "no" | "void";

export interface Evidence {
  version: 1;
  market: string;
  tokenRef: string;
  threshold: string;
  expiryTs: number;
  window: { startTs: number; endTs: number; secs: number };
  parameters: {
    minLiquidityUsd: string;
    minCoverage: number;
    minSustainedFraction: number;
    sampleIntervalSecs: number;
    maxStalenessSecs: number;
    medianRule: "lower-median";
    twapRule: "step-hold-last";
  };
  samples: {
    count: number;
    staleExcluded: number;
    expected: number;
    coverage: number;
    aboveThresholdFraction: number;
    marketCap: { min: string; max: string; median: string; twap: string };
    liquidity: { min: string; median: string };
    series: Array<[number, string]>;
  };
  rules: {
    liquidityOk: boolean;
    coverageOk: boolean;
    twapAtLeastThreshold: boolean;
    sustainedAtLeastMinFraction: boolean;
  };
  outcome: OutcomeName;
  reason: string;
  feed: { address: string; authority: string };
  hash?: string;
  txSignature?: string;
}
