import { priceYes, type MarketAccount } from "@lifecycle-markets/sdk";
import { marketLabels } from "./labels";
import { short, usd } from "./format";

const compact = (v: bigint): string => {
  const n = Number(v) / 1e6;
  return n >= 1e9 ? `$${+(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${+(n / 1e3).toFixed(1)}k` : `$${n}`;
};

/** Title: curated label, else "$SYMBOL ≥ $1M market cap" using the resolver's token metadata, else a short address. */
export const marketTitle = (m: MarketAccount, symbol?: string | null): string =>
  marketLabels[m.address.toBase58()] ?? `${symbol ? "$" + symbol.replace(/^\$/, "") : "Token " + short(m.tokenRef.toBase58())} ≥ ${compact(m.threshold)} market cap`;

export const yesProb = (m: MarketAccount): number => priceYes(m.yesReserve, m.noReserve);

export const statusInfo = (m: MarketAccount, now: number): { label: string; tone: "live" | "wait" | "yes" | "no" | "void" } => {
  switch (m.status) {
    case "resolvedYes": return { label: "Resolved: YES", tone: "yes" };
    case "resolvedNo": return { label: "Resolved: NO", tone: "no" };
    case "void": return { label: "Void", tone: "void" };
    default: return Number(m.expiryTs) <= now ? { label: "Awaiting resolution", tone: "wait" } : { label: "Live", tone: "live" };
  }
};

/** Trading closes when the final window OPENS (the AMM price used by Void settlement cannot be moved while prices are sampled). */
export const tradingEnds = (m: MarketAccount): number => Number(m.expiryTs) - m.resolutionWindowSecs;
export const isTradable = (m: MarketAccount, now: number) => m.status === "open" && now < tradingEnds(m);
