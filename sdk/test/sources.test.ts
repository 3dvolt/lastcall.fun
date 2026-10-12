import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateWindow, parseMint, parsePool, parsePythSolUsd, parseTokenAmount, pumpQuote } from "../src/index.js";

const fx = JSON.parse(readFileSync(new URL("./pumpswap_mainnet.json", import.meta.url), "utf8"));
const golden = JSON.parse(readFileSync(new URL("./pumpswap_golden.json", import.meta.url), "utf8"));
const data = (k: string) => new Uint8Array(Buffer.from(fx[k].data, "base64"));

describe("PumpSwap + Pyth maths on a REAL mainnet snapshot match the Rust program exactly", () => {
  it("parses the pool and its vaults", () => {
    const p = parsePool(data("pool"));
    expect(p.baseMint.toBase58()).toBe(fx.base_mint.address);
    expect(p.baseVault.toBase58()).toBe(fx.base_vault.address);
    expect(p.quoteVault.toBase58()).toBe(fx.quote_vault.address);
    expect(p.quoteMint.toBase58()).toBe("So11111111111111111111111111111111111111112");
  });
  it("reproduces the golden numbers computed by the program code", () => {
    const base = parseTokenAmount(data("base_vault")), quote = parseTokenAmount(data("quote_vault"));
    const { supply, decimals } = parseMint(data("base_mint"));
    expect([base, quote, supply, decimals]).toEqual([BigInt(golden.base), BigInt(golden.quote), BigInt(golden.supply), golden.decimals]);
    const usd = parsePythSolUsd(data("pyth_sol_usd"), golden.publishTs + 1);
    expect(usd).toBe(BigInt(golden.usdPerSol6));
    const q = pumpQuote(base, quote, supply, usd);
    expect(q.marketCap).toBe(BigInt(golden.marketCap6));
    expect(q.liquidity).toBe(BigInt(golden.liquidity6));
  });
  it("refuses stale or wrong oracle data like the program does", () => {
    const d = data("pyth_sol_usd");
    expect(() => parsePythSolUsd(d, golden.publishTs + 301)).toThrow(/stale/);
    expect(() => parsePythSolUsd(d, golden.publishTs - 60)).toThrow(/stale/);
    const wrong = new Uint8Array(d);
    wrong[41] ^= 1;
    expect(() => parsePythSolUsd(wrong, golden.publishTs)).toThrow();
  });
});

describe("window rule mirror", () => {
  const run = (caps: number[], liq: number, slots: number, th = 1000n) => {
    const m: bigint[] = Array(slots).fill(0n), l: bigint[] = Array(slots).fill(0n), f: boolean[] = Array(slots).fill(false);
    caps.forEach((c, i) => { m[i] = BigInt(c); l[i] = BigInt(liq); f[i] = true; });
    return evaluateWindow(slots, m, l, f, th, 10_000n).verdict;
  };
  it("matches the program's boundaries", () => {
    expect(run(Array(30).fill(1500), 250_000, 30)).toBe("yes");
    expect(run([...Array(27).fill(1500), ...Array(3).fill(500)], 250_000, 30)).toBe("yes"); // 90%
    expect(run([...Array(26).fill(1500), ...Array(4).fill(500)], 250_000, 30)).toBe("no");
    expect(run([...Array(28).fill(600), 3000, 3000], 250_000, 30)).toBe("no"); // pump
    expect(run(Array(23).fill(5000), 250_000, 30)).toBe("void"); // 76.7% coverage
    expect(run(Array(24).fill(5000), 250_000, 30)).toBe("yes"); // exactly 80%
    expect(run(Array(30).fill(5000), 9_999, 30)).toBe("void");
    expect(run([], 0, 30)).toBe("void");
  });
});
