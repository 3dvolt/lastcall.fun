import { priceYes, type MarketAccount } from "@lifecycle-markets/sdk";
import { marketLabels } from "./labels";
import { short, usd } from "./format";

export const marketTitle = (m: MarketAccount): string =>
  marketLabels[m.address.toBase58()] ?? `Token ${short(m.tokenRef.toBase58())} ≥ ${usd(m.threshold)} market cap`;

export const yesProb = (m: MarketAccount): number => priceYes(m.yesReserve, m.noReserve);

export const statusInfo = (m: MarketAccount, now: number): { label: string; tone: "live" | "wait" | "yes" | "no" | "void" } => {
  switch (m.status) {
    case "resolvedYes": return { label: "Resolved: YES", tone: "yes" };
    case "resolvedNo": return { label: "Resolved: NO", tone: "no" };
    case "void": return { label: "Void", tone: "void" };
    default: return Number(m.expiryTs) <= now ? { label: "Awaiting resolution", tone: "wait" } : { label: "Live", tone: "live" };
  }
};

export const isTradable = (m: MarketAccount, now: number) => m.status === "open" && Number(m.expiryTs) > now;
