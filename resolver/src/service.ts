import type { MarketAccount } from "@lifecycle-markets/sdk";
import { LifecycleClient } from "@lifecycle-markets/sdk";
import { PublicKey } from "@solana/web3.js";
import { evaluate } from "./evaluator.js";
import type { Provider } from "./provider.js";
import type { Store } from "./store.js";
import type { EvalParams } from "./types.js";
import { evidenceHash } from "./canonical.js";

export interface ServiceOptions {
  client: LifecycleClient; // wallet = resolver keypair
  provider: Provider;
  store: Store;
  params: EvalParams;
  /** if set, overrides the per-market on-chain resolutionWindowSecs */
  windowOverrideSecs?: number;
  allowedCreators?: PublicKey[];
  now?: () => number;
  log?: (msg: string) => void;
}

/** Samples every open market's feed and resolves markets after expiry. */
export class ResolverService {
  private markets = new Map<string, MarketAccount>();
  private feedInfo = new Map<string, { address: string; authority: string }>();
  private resolving = new Set<string>();
  lastSampleTs = 0;
  private now: () => number;
  private log: (m: string) => void;

  constructor(private o: ServiceOptions) {
    this.now = o.now ?? (() => Math.floor(Date.now() / 1000));
    this.log = o.log ?? ((m) => console.log(`[resolver] ${m}`));
  }

  get trackedMarkets(): MarketAccount[] { return [...this.markets.values()]; }
  windowFor(m: MarketAccount): number { return this.o.windowOverrideSecs ?? m.resolutionWindowSecs; }

  async refreshMarkets() {
    const all = await this.o.client.listMarkets();
    const ok = (m: MarketAccount) => !this.o.allowedCreators || this.o.allowedCreators.some((c) => c.equals(m.creator));
    this.markets = new Map(all.filter(ok).map((m) => [m.address.toBase58(), m]));
  }

  /** One sampling pass over all open markets (feeds shared by several markets are read once). */
  async sampleOnce() {
    const ts = this.now();
    const byToken = new Map<string, PublicKey>();
    for (const m of this.markets.values()) if (m.status === "open" && m.resolver.equals(this.o.client.wallet)) byToken.set(m.tokenRef.toBase58(), m.tokenRef);
    const quotes = new Map<string, Awaited<ReturnType<Provider["fetch"]>>>();
    for (const [k, ref] of byToken) {
      try { quotes.set(k, await this.o.provider.fetch(ref)); } catch (e) { this.log(`provider error for ${k}: ${(e as Error).message}`); quotes.set(k, null); }
    }
    for (const m of this.markets.values()) {
      if (m.status !== "open" || !m.resolver.equals(this.o.client.wallet)) continue;
      const q = quotes.get(m.tokenRef.toBase58());
      if (!q) continue; // missing data = missing sample (lowers coverage)
      const stale = q.updatedTs !== undefined && ts - q.updatedTs > this.o.params.maxStalenessSecs;
      this.o.store.addSample(m.address.toBase58(), {
        ts, price: q.price, circulatingSupply: q.circulatingSupply, liquidityUsd: q.liquidityUsd,
        marketCap: q.price * q.circulatingSupply, feedUpdatedTs: q.updatedTs, stale,
      });
      this.feedInfo.set(m.address.toBase58(), q.source);
    }
    this.lastSampleTs = ts;
  }

  /** Resolves every open market that is past expiry (+ one sample interval so the window's last sample is stored). */
  async resolveDue() {
    const now = this.now();
    for (const m of this.markets.values()) {
      const key = m.address.toBase58();
      if (m.status !== "open" || !m.resolver.equals(this.o.client.wallet) || this.resolving.has(key)) continue;
      if (now < Number(m.expiryTs) + this.o.params.sampleIntervalSecs) continue;
      this.resolving.add(key);
      try { await this.resolveMarket(m); } catch (e) { this.log(`resolve ${key} failed (will retry): ${(e as Error).message}`); }
      finally { this.resolving.delete(key); }
    }
  }

  async resolveMarket(m: MarketAccount) {
    const key = m.address.toBase58();
    let ev = this.o.store.getEvidence(key);
    if (!ev) {
      const src = this.feedInfo.get(key) ?? { address: this.o.client.feedAddress(m.tokenRef).toBase58(), authority: "unknown" };
      ev = evaluate({
        market: m.address, tokenRef: m.tokenRef, threshold: m.threshold, expiryTs: Number(m.expiryTs),
        windowSecs: this.windowFor(m), samples: this.o.store.getSamples(key), params: this.o.params,
        feed: { address: new PublicKey(src.address), authority: src.authority === "unknown" ? PublicKey.default : new PublicKey(src.authority) },
      });
      this.o.store.saveEvidence(key, ev); // persisted BEFORE sending so a retry reuses the identical hash
    }
    const hash = evidenceHash(ev);
    const sig = await this.o.client.resolve(m, ev.outcome, hash);
    ev.txSignature = sig;
    this.o.store.saveEvidence(key, ev);
    this.log(`resolved ${key} -> ${ev.outcome.toUpperCase()} (${ev.reason}) tx ${sig}`);
    await this.refreshMarkets();
  }
}
