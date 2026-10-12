/** Display-only token name/symbol from DexScreener (never used for any decision). Null on any problem. */
export async function fetchTokenLabel(mint: string): Promise<{ symbol: string; name: string } | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(mint)}`, { credentials: "omit", referrerPolicy: "no-referrer", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const j = (await res.json()) as { pairs?: Array<{ chainId?: string; baseToken?: { address?: string; symbol?: string; name?: string } }> };
    const p = j.pairs?.find((x) => x.chainId === "solana" && x.baseToken?.address === mint);
    const clean = (v?: string, n = 24) => (v ?? "").replace(/[^\p{L}\p{N} ._$-]/gu, "").slice(0, n);
    return p?.baseToken?.symbol ? { symbol: clean(p.baseToken.symbol, 12), name: clean(p.baseToken.name, 40) } : null;
  } catch { return null; }
}
