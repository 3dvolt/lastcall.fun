import { evaluateWindow, findPumpPools, readPumpQuote, type MarketAccount, type PumpQuote } from "@lifecycle-markets/sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { fetchTokenLabel } from "../lib/api";
import { knownMarketAddresses } from "../lib/labels";
import { useClient } from "../lib/client";
import { config } from "../config";

/**
 * Markets are permissionless: anyone can create one. We only show markets that use OUR collateral and a price source we trust
 * (the PumpSwap on-chain reader; the test feed only where it is explicitly allowed). The outcome of every market is computed by the
 * program from on-chain prices, so there is no resolver to trust, but a creator still chooses the pool, the threshold and the window.
 */
export const isTrusted = (m: MarketAccount): boolean =>
  (!config.collateralMint || m.collateralMint.equals(config.collateralMint)) &&
  m.sourceKind === "pumpSwap";

export const useMarkets = () => {
  const { client } = useClient();
  return useQuery({ queryKey: ["markets"], queryFn: async () => (await client.listMarkets(knownMarketAddresses().map((a) => new PublicKey(a)))).filter(isTrusted), refetchInterval: 10_000 });
};

export const useMarket = (address: string | undefined) => {
  const { client } = useClient();
  return useQuery({
    queryKey: ["market", address], enabled: !!address, refetchInterval: 4_000,
    queryFn: async (): Promise<MarketAccount | null> => client.getMarket(new PublicKey(address!)),
  });
};

export const usePosition = (market: PublicKey | undefined, user: PublicKey | null | undefined) => {
  const { client } = useClient();
  return useQuery({
    queryKey: ["position", market?.toBase58(), user?.toBase58()], enabled: !!market && !!user, refetchInterval: 6_000,
    queryFn: () => client.getPosition(market!, user!),
  });
};

/** Collateral balance in base units; 0n if the wallet has no token account yet. */
export const useCollateralBalance = (user: PublicKey | null | undefined) => {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["balance", user?.toBase58()], enabled: !!user && !!config.collateralMint, refetchInterval: 8_000,
    queryFn: async () => {
      try { return (await getAccount(connection, getAssociatedTokenAddressSync(config.collateralMint!, user!))).amount; }
      catch { return 0n; }
    },
  });
};

export interface LiveQuote { marketCap: bigint; liquidity: bigint; priceUsd?: number; at: number }

/** The price the program would record right now, read straight from the chain (same maths as the program). */
export const useLiveQuote = (m: MarketAccount | undefined, enabled = true, everyMs = 5_000) => {
  const { connection } = useConnection();
  const { client } = useClient();
  return useQuery({
    queryKey: ["live-quote", m?.address.toBase58()], enabled: !!m && enabled, refetchInterval: everyMs, retry: 1,
    queryFn: async (): Promise<LiveQuote> => {
      if (m!.sourceKind === "pumpSwap") {
        const q: PumpQuote = await readPumpQuote(connection, m!.sourcePool);
        return { marketCap: q.marketCap, liquidity: q.liquidity, priceUsd: q.priceUsd, at: Math.floor(Date.now() / 1000) };
      }
      const f = await client.getFeed(m!.tokenRef);
      if (!f) throw new Error("feed not found");
      return { marketCap: f.price * f.circulatingSupply, liquidity: f.liquidityUsd, at: Number(f.updatedTs) };
    },
  });
};

/** On-chain samples recorded in the final window (the ONLY data that decides the outcome). */
export const useSampleBuffer = (m: MarketAccount | undefined) => {
  const { client } = useClient();
  return useQuery({ queryKey: ["samples", m?.address.toBase58()], enabled: !!m, refetchInterval: 5_000, queryFn: () => client.getSampleBuffer(m!) });
};

/** "If the market resolved right now": the SDK mirror of the program's rule applied to the samples recorded so far. */
export const usePreview = (m: MarketAccount | undefined, buf: ReturnType<typeof useSampleBuffer>["data"]) =>
  m && buf ? evaluateWindow(m.sampleSlots, buf.mcap, buf.liquidity, buf.filled, m.threshold, m.minLiquidityUsd) : null;

export interface HistoryPoint { t: number; v: bigint }

/**
 * Client-side price history for the chart: the chain only stores the final window, so earlier points are collected
 * while the page is open and kept in this browser (localStorage). Display only.
 */
export function useLiveHistory(market: string | undefined, quote: LiveQuote | undefined): HistoryPoint[] {
  const key = market ? `lc-hist-${market}` : "";
  const [pts, setPts] = useState<HistoryPoint[]>(() => {
    try { return (JSON.parse(localStorage.getItem(key) ?? "[]") as Array<[number, string]>).map(([t, v]) => ({ t, v: BigInt(v) })); } catch { return []; }
  });
  useEffect(() => {
    if (!quote || !market) return;
    setPts((cur) => {
      if (cur.length && quote.at - cur[cur.length - 1].t < 4) return cur;
      const next = [...cur, { t: quote.at, v: quote.marketCap }].slice(-1500);
      try { localStorage.setItem(key, JSON.stringify(next.map((p) => [p.t, p.v.toString()]))); } catch { /* storage full or blocked */ }
      return next;
    });
  }, [quote?.at, quote?.marketCap, market, key]);
  return pts;
}

export const useTokenLabel = (mint: string | undefined) =>
  useQuery({ queryKey: ["token-label", mint], enabled: !!mint, staleTime: 3_600_000, retry: false, queryFn: () => fetchTokenLabel(mint!) });

export const usePools = (mint: PublicKey | null) => {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["pools", mint?.toBase58()], enabled: !!mint, retry: false, staleTime: 15_000,
    queryFn: async () => {
      const listConn = config.listRpcUrl ? new Connection(config.listRpcUrl, "confirmed") : connection; // gPA goes to the public RPC
      const pools = await findPumpPools(listConn, mint!);
      if (pools.length === 0) return null;
      return { pools, quote: await readPumpQuote(connection, pools[0].pool) };
    },
  });
};

export const useNow = (): number => {
  // coarse client clock for countdowns only; the chain clock is authoritative
  return useQuery({ queryKey: ["now"], queryFn: () => Math.floor(Date.now() / 1000), refetchInterval: 1_000, staleTime: 0, gcTime: 0 }).data ?? Math.floor(Date.now() / 1000);
};
export { getAssociatedTokenAddressSync };
