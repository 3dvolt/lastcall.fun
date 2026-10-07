/**
 * Demo scenario profiles. Pure functions: (seconds until expiry) -> feed values.
 * Shared by scripts/scenario.ts (drives the on-chain DemoFeed) and the resolver unit tests.
 * Threshold used by all scenarios: $1,000,000 market cap, supply fixed at 1,000,000 whole tokens.
 */
export const SCENARIO_NAMES = ["organic_growth", "pump_and_dump_attack", "thin_liquidity", "stays_below"] as const;
export type ScenarioName = (typeof SCENARIO_NAMES)[number];

export const SCENARIO_THRESHOLD_USD6 = 1_000_000_000_000n; // $1,000,000
export const SCENARIO_SUPPLY = 1_000_000n; // whole tokens
export const SCENARIO_EXPECTED: Record<ScenarioName, "yes" | "no" | "void"> = {
  organic_growth: "yes",
  pump_and_dump_attack: "no",
  thin_liquidity: "void",
  stays_below: "no",
};

export interface FeedValues {
  price: bigint; // USD6
  circulatingSupply: bigint;
  liquidityUsd: bigint; // USD6
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const T = Number(SCENARIO_THRESHOLD_USD6);
const fromCap = (capFracOfThreshold: number, liquidityUsd: number): FeedValues => ({
  price: BigInt(Math.round((capFracOfThreshold * T) / Number(SCENARIO_SUPPLY))),
  circulatingSupply: SCENARIO_SUPPLY,
  liquidityUsd: BigInt(Math.round(liquidityUsd * 1e6)),
});

/**
 * @param secsToExpiry seconds until market expiry (negative after expiry)
 * @param totalSecs    scenario duration from start to expiry
 * @param windowSecs   resolver sampling window
 * @param seed         deterministic noise seed
 */
export function scenarioFeed(name: ScenarioName, secsToExpiry: number, totalSecs: number, windowSecs: number, seed = 1): FeedValues {
  const rnd = mulberry32(seed * 100003 + Math.floor(secsToExpiry));
  const noise = (amp: number) => (rnd() * 2 - 1) * amp;
  const progress = Math.min(1, Math.max(0, (totalSecs - secsToExpiry) / Math.max(1, totalSecs - windowSecs)));
  switch (name) {
    case "organic_growth":
      // climbs from 0.6x to ~1.3x of threshold, then stays comfortably above for the whole window
      return fromCap(secsToExpiry > windowSecs ? 0.6 + 0.65 * progress + noise(0.03) : 1.3 + noise(0.08), 250_000);
    case "pump_and_dump_attack":
      // honest cap ~0.6x; in the last 15s a whale pumps it to 3x, then dumps right after expiry
      return fromCap(secsToExpiry > 0 && secsToExpiry <= 15 ? 3.0 + noise(0.2) : 0.6 + noise(0.05), 250_000);
    case "thin_liquidity":
      // cap well above threshold, but only $2,000 of liquidity (min is $10,000)
      return fromCap(1.4 + noise(0.05), 2_000);
    case "stays_below":
      return fromCap(0.55 + noise(0.2), 250_000);
  }
}
