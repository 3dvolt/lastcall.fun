import type { MarketAccount } from "@lifecycle-markets/sdk";
import { getAccount, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "@solana/wallet-adapter-react";
import { fetchEvidence, fetchHealth, fetchSamples } from "../lib/api";
import { useClient } from "../lib/client";
import { config } from "../config";

/** Anyone can create markets on-chain with their own resolver/mint: only show ones using OUR resolver and collateral. */
export const isTrusted = (m: MarketAccount): boolean =>
  (!config.resolver || m.resolver.equals(config.resolver)) && (!config.collateralMint || m.collateralMint.equals(config.collateralMint));

export const useMarkets = () => {
  const { client } = useClient();
  return useQuery({ queryKey: ["markets"], queryFn: async () => (await client.listMarkets()).filter(isTrusted), refetchInterval: 10_000 });
};

export const useMarket = (address: string | undefined) => {
  const { client } = useClient();
  return useQuery({
    queryKey: ["market", address],
    enabled: !!address,
    refetchInterval: 4_000,
    queryFn: async (): Promise<MarketAccount | null> => client.getMarket(new PublicKey(address!)),
  });
};

export const usePosition = (market: PublicKey | undefined, user: PublicKey | null | undefined) => {
  const { client } = useClient();
  return useQuery({
    queryKey: ["position", market?.toBase58(), user?.toBase58()],
    enabled: !!market && !!user,
    refetchInterval: 6_000,
    queryFn: () => client.getPosition(market!, user!),
  });
};

/** Test-token balance in base units; 0n if the wallet has no token account yet. */
export const useCollateralBalance = (user: PublicKey | null | undefined) => {
  const { connection } = useConnection();
  return useQuery({
    queryKey: ["balance", user?.toBase58()],
    enabled: !!user && !!config.collateralMint,
    refetchInterval: 8_000,
    queryFn: async () => {
      try { return (await getAccount(connection, getAssociatedTokenAddressSync(config.collateralMint!, user!))).amount; }
      catch { return 0n; }
    },
  });
};

export const useSamples = (market: string | undefined, live: boolean) =>
  useQuery({ queryKey: ["samples", market], enabled: !!market, refetchInterval: live ? 5_000 : false, queryFn: () => fetchSamples(market!) });

export const useEvidence = (market: string | undefined, resolved: boolean) =>
  useQuery({ queryKey: ["evidence", market], enabled: !!market && resolved, queryFn: () => fetchEvidence(market!) });

export const useHealth = () => useQuery({ queryKey: ["health"], queryFn: fetchHealth, refetchInterval: 30_000, retry: false });

export const useFeed = (tokenRef: PublicKey | undefined) => {
  const { client } = useClient();
  return useQuery({ queryKey: ["feed", tokenRef?.toBase58()], enabled: !!tokenRef, refetchInterval: 10_000, queryFn: () => client.getFeed(tokenRef!) });
};

export const useNow = (): number => {
  // coarse, client-side clock for countdown display only; the chain clock is authoritative
  return useQuery({ queryKey: ["now"], queryFn: () => Math.floor(Date.now() / 1000), refetchInterval: 1_000, staleTime: 0, gcTime: 0 }).data ?? Math.floor(Date.now() / 1000);
};
export { getAssociatedTokenAddressSync };
