import { config } from "../config";

interface Dep { markets?: Array<{ market: string; label: string }> }
const files = import.meta.glob("../../../deployments/*.json", { eager: true, import: "default" }) as Record<string, Dep>;

/** Human labels for seeded/scenario markets, from deployments/<cluster>.json (labels are not stored on-chain). */
export const marketLabels: Record<string, string> = Object.fromEntries(
  Object.entries(files)
    .filter(([p]) => p.endsWith(`/${config.cluster}.json`))
    .flatMap(([, d]) => (d.markets ?? []).map((m) => [m.market, m.label] as const)),
);
