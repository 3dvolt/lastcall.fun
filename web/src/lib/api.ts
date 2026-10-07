import { config } from "../config";

export interface ApiSample { ts: number; price: string; circulatingSupply: string; liquidityUsd: string; marketCap: string; stale: boolean }
export interface ApiEvidence {
  version: number; market: string; tokenRef: string; threshold: string; expiryTs: number;
  window: { startTs: number; endTs: number; secs: number };
  parameters: { minLiquidityUsd: string; minCoverage: number; minSustainedFraction: number; sampleIntervalSecs: number; maxStalenessSecs: number };
  samples: { count: number; staleExcluded: number; expected: number; coverage: number; aboveThresholdFraction: number;
    marketCap: { min: string; max: string; median: string; twap: string }; liquidity: { min: string; median: string } };
  rules: { liquidityOk: boolean; coverageOk: boolean; twapAtLeastThreshold: boolean; sustainedAtLeastMinFraction: boolean };
  outcome: "yes" | "no" | "void"; reason: string; feed: { address: string; authority: string }; hash: string; txSignature?: string;
}
export interface ApiHealth { ok: boolean; resolver: string; demoAuthority: string; cluster: string; provider: string; lastSampleTs: number }

async function getJson<T>(path: string): Promise<T | null> {
  if (!config.resolverApi) return null;
  const res = await fetch(`${config.resolverApi}${path}`, { headers: { accept: "application/json" }, credentials: "omit", referrerPolicy: "no-referrer" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`resolver API ${res.status}`);
  return (await res.json()) as T;
}

export const fetchHealth = () => getJson<ApiHealth>("/health");
export const fetchSamples = async (market: string) => (await getJson<{ samples: ApiSample[] }>(`/markets/${market}/samples?limit=1000`))?.samples ?? [];
export const fetchEvidence = (market: string) => getJson<ApiEvidence>(`/markets/${market}/evidence`);

export async function requestFaucet(wallet: string): Promise<void> {
  if (!config.faucetApi) throw new Error("Faucet is not configured.");
  const res = await fetch(`${config.faucetApi}/faucet`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ wallet }), credentials: "omit", referrerPolicy: "no-referrer",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `faucet error ${res.status}`);
}
