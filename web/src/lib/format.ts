/** Money helpers. All on-chain amounts are bigint base units with 6 decimals. */
export const DECIMALS = 6;
const SCALE = 10n ** BigInt(DECIMALS);

/** Strict decimal parser: returns null on anything that is not a plain non-negative number with ≤ 6 decimals. */
export function parseUnits(input: string): bigint | null {
  const s = input.trim();
  if (!/^(\d+\.?\d{0,6}|\.\d{1,6})$/.test(s)) return null;
  const [w = "0", f = ""] = s.split(".");
  return BigInt(w || "0") * SCALE + BigInt(f.padEnd(DECIMALS, "0") || "0");
}

export function formatUnits(v: bigint, maxFrac = 2): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const whole = a / SCALE;
  let frac = (a % SCALE).toString().padStart(DECIMALS, "0").slice(0, maxFrac).replace(/0+$/, "");
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}${frac ? "." + frac : ""}`;
}

export const usd = (v: bigint, maxFrac = 0) => `$${formatUnits(v, maxFrac)}`;
export const pct = (x: number) => `${(x * 100).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
export const short = (s: string, n = 4) => `${s.slice(0, n)}…${s.slice(-n)}`;

export function countdown(secs: number): string {
  if (secs <= 0) return "ended";
  const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return m > 0 ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

/** apply slippage tolerance (basis points) to a minimum-out amount */
export const withSlippage = (amount: bigint, slippageBps: number): bigint => (amount * BigInt(10_000 - slippageBps)) / 10_000n;
