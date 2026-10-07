import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { evaluate } from "../src/evaluator.js";
import { canonicalJson, evidenceHash } from "../src/canonical.js";
import { SCENARIO_EXPECTED, SCENARIO_NAMES, SCENARIO_SUPPLY, SCENARIO_THRESHOLD_USD6, scenarioFeed, type ScenarioName } from "../src/scenarios.js";
import { DEFAULT_PARAMS, type Sample } from "../src/types.js";

const market = Keypair.generate().publicKey, tokenRef = Keypair.generate().publicKey, auth = Keypair.generate().publicKey;
const EXPIRY = 1_000_000, W = 300, TOTAL = 480;

/** Samples every `step` seconds over the scenario, as the sampler would take them. */
function sampleScenario(name: ScenarioName, step = 10, offset = 0): Sample[] {
  const out: Sample[] = [];
  for (let ts = EXPIRY - TOTAL + offset; ts < EXPIRY + 20; ts += step) {
    const f = scenarioFeed(name, EXPIRY - ts, TOTAL, W);
    out.push({ ts, price: f.price, circulatingSupply: f.circulatingSupply, liquidityUsd: f.liquidityUsd, marketCap: f.price * f.circulatingSupply });
  }
  return out;
}
const run = (samples: Sample[]) =>
  evaluate({ market, tokenRef, threshold: SCENARIO_THRESHOLD_USD6, expiryTs: EXPIRY, windowSecs: W, samples, params: DEFAULT_PARAMS, feed: { address: market, authority: auth } });

describe("scenario rules (a)-(d)", () => {
  for (const name of SCENARIO_NAMES) {
    it(`${name} -> ${SCENARIO_EXPECTED[name]}`, () => {
      for (const offset of [0, 3, 7]) {
        const ev = run(sampleScenario(name, 10, offset));
        expect(ev.outcome, ev.reason).toBe(SCENARIO_EXPECTED[name]);
      }
    });
  }

  it("(b) pump: the spike is visible in the data yet never yields YES, at any sampling phase and interval", () => {
    for (const step of [1, 2, 5, 10]) {
      for (let offset = 0; offset < step; offset++) {
        const s = sampleScenario("pump_and_dump_attack", step, offset);
        const ev = run(s);
        expect(BigInt(ev.samples.marketCap.max) >= SCENARIO_THRESHOLD_USD6 || step >= 10).toBe(true);
        expect(ev.outcome).not.toBe("yes");
      }
    }
  });
});

describe("rule details", () => {
  const mk = (caps: number[], liq = 250_000, step = 10): Sample[] =>
    caps.map((c, i) => ({ ts: EXPIRY - W + i * step, price: BigInt(c), circulatingSupply: 1n, liquidityUsd: BigInt(liq) * 1_000_000n, marketCap: BigInt(c) }));
  const T = 1000n;
  const ev = (samples: Sample[]) => evaluate({ market, tokenRef, threshold: T, expiryTs: EXPIRY, windowSecs: W, samples, params: DEFAULT_PARAMS, feed: { address: market, authority: auth } });

  it("all above -> yes; exactly 90% above with TWAP ok -> yes; 89% -> no", () => {
    expect(ev(mk(Array(30).fill(1500))).outcome).toBe("yes");
    expect(ev(mk([...Array(27).fill(1500), ...Array(3).fill(500)])).outcome).toBe("yes"); // 27/30 = 90%
    expect(ev(mk([...Array(26).fill(1500), ...Array(4).fill(500)])).outcome).toBe("no"); // 86.7%
  });
  it("90% above but TWAP below threshold -> no", () => {
    // 27 samples barely above, 3 samples at ~zero => TWAP = (27*1001 + 0)/30 = 900 < 1000
    expect(ev(mk([...Array(27).fill(1001), ...Array(3).fill(0)])).outcome).toBe("no");
  });
  it("TWAP above but not sustained (a few giant samples) -> no", () => {
    expect(ev(mk([...Array(24).fill(900), ...Array(6).fill(50_000)])).outcome).toBe("no");
  });
  it("coverage < 80% -> void even if every sample is above", () => {
    expect(ev(mk(Array(23).fill(5000))).outcome).toBe("void"); // 23/30 = 76.7%
    expect(ev(mk(Array(24).fill(5000))).outcome).toBe("yes"); // exactly 80%
  });
  it("no samples at all -> void", () => {
    expect(ev([]).outcome).toBe("void");
  });
  it("median liquidity below minimum -> void (checked before YES)", () => {
    expect(ev(mk(Array(30).fill(5000), 9_999)).outcome).toBe("void");
    expect(ev(mk(Array(30).fill(5000), 10_000)).outcome).toBe("yes");
  });
  it("stale samples are excluded and reduce coverage", () => {
    const s = mk(Array(30).fill(5000)).map((x, i) => (i < 10 ? { ...x, stale: true } : x));
    const e = ev(s);
    expect(e.samples.staleExcluded).toBe(10);
    expect(e.outcome).toBe("void");
  });
  it("samples outside the window are ignored", () => {
    const inside = mk(Array(30).fill(500));
    const outside: Sample[] = [{ ...inside[0], ts: EXPIRY - W - 1, marketCap: 10n ** 12n }, { ...inside[0], ts: EXPIRY, marketCap: 10n ** 12n }];
    expect(ev([...outside, ...inside]).outcome).toBe("no");
  });
  it("TWAP weights samples by hold time", () => {
    // 1 sample at window start holds 290s at 0, last sample (10s) at 100000 => twap ~ 3333
    const s = [{ ...mk([0])[0], ts: EXPIRY - W }, { ...mk([100_000])[0], ts: EXPIRY - 10 }];
    expect(ev(s).samples.marketCap.twap).toBe(((0n * 290n + 100_000n * 10n) / 300n).toString());
  });
});

describe("evidence hash", () => {
  it("is deterministic, key-order independent and ignores hash/txSignature", () => {
    const e = run(sampleScenario("organic_growth"));
    expect(e.hash).toBe(evidenceHash(e).toString("hex"));
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[3,{"y":2,"z":1}],"d":2},"b":1}');
    expect(evidenceHash({ ...e, txSignature: "x", hash: "y" }).toString("hex")).toBe(e.hash);
    expect(run(sampleScenario("organic_growth")).hash).toBe(e.hash);
    expect(run(sampleScenario("stays_below")).hash).not.toBe(e.hash);
  });
  it("supply constant sanity", () => { expect(SCENARIO_SUPPLY).toBe(1_000_000n); });
});
