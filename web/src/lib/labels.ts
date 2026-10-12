import { config } from "../config";

interface Dep { markets?: Array<{ market: string; label: string }> }
const files = import.meta.glob("../../../deployments/*.json", { eager: true, import: "default" }) as Record<string, Dep>;

/** Human labels for seeded/scenario markets, from deployments/<cluster>.json (labels are not stored on-chain). */
export const marketLabels: Record<string, string> = Object.fromEntries(
  Object.entries(files)
    .filter(([p]) => p.endsWith(`/${config.cluster}.json`))
    .flatMap(([, d]) => (d.markets ?? []).map((m) => [m.market, m.label] as const)),
);

const files2 = import.meta.glob("../../../deployments/*.json", { eager: true, import: "default" }) as Record<string, { markets?: Array<{ market: string }> }>;

/** Market addresses published in deployments/<cluster>.json plus the ones created from this browser (used when the RPC cannot list program accounts). */
export function knownMarketAddresses(): string[] {
  const fromFile = Object.entries(files2).filter(([p]) => p.endsWith(`/${config.cluster}.json`)).flatMap(([, d]) => (d.markets ?? []).map((m) => m.market));
  let mine: string[] = [];
  try { mine = JSON.parse(localStorage.getItem(`lc-created-${config.cluster}`) ?? "[]") as string[]; } catch { /* ignore */ }
  return [...new Set([...fromFile, ...mine])];
}
export function rememberCreatedMarket(address: string) {
  try {
    const key = `lc-created-${config.cluster}`;
    const cur = JSON.parse(localStorage.getItem(key) ?? "[]") as string[];
    localStorage.setItem(key, JSON.stringify([...new Set([address, ...cur])].slice(0, 200)));
  } catch { /* storage unavailable */ }
}
