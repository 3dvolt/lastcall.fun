import express from "express";
import type { ResolverService } from "./service.js";
import { isMarketId, type Store } from "./store.js";

export interface ApiInfo { programId: string; cluster: string; resolver: string; demoAuthority: string; provider: string; }

const outcomeOf = (s: string) => (s === "resolvedYes" ? "yes" : s === "resolvedNo" ? "no" : s === "void" ? "void" : null);

export function createApi(svc: ResolverService, store: Store, info: ApiInfo) {
  const app = express();
  const started = Date.now();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // naive per-IP limiter (120 req/min); put a real WAF / CDN limiter in front for production
  const hits = new Map<string, { n: number; reset: number }>();
  app.use((req, res, next) => {
    const now = Date.now(), ip = req.ip ?? "?";
    const h = hits.get(ip);
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
    else if (++h.n > 120) { res.status(429).json({ error: "rate limit" }); return; }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  });
  app.param("id", (_req, res, next, id) => { if (!isMarketId(String(id))) { res.status(400).json({ error: "invalid market id" }); return; } next(); });

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ...info, trackedMarkets: svc.trackedMarkets.length, lastSampleTs: svc.lastSampleTs, uptimeSecs: Math.floor((Date.now() - started) / 1000) });
  });

  app.get("/markets", (_req, res) => {
    res.json(svc.trackedMarkets.map((m) => ({
      market: m.address.toBase58(), tokenRef: m.tokenRef.toBase58(), status: m.status, expiryTs: Number(m.expiryTs),
      threshold: m.threshold.toString(), resolved: m.status !== "open", outcome: outcomeOf(m.status),
      sampleCount: store.getSamples(m.address.toBase58()).length,
    })));
  });

  app.get("/markets/:id/samples", (req, res) => {
    const m = svc.trackedMarkets.find((x) => x.address.toBase58() === req.params.id);
    if (!m) { res.status(404).json({ error: "unknown market" }); return; }
    const from = req.query.from !== undefined ? Number(req.query.from) : -Infinity;
    const to = req.query.to !== undefined ? Number(req.query.to) : Infinity;
    const limit = Math.min(5000, Number(req.query.limit ?? 5000)) || 5000;
    const samples = store.getSamples(req.params.id).filter((s) => s.ts >= from && s.ts <= to).slice(-limit).map((s) => ({
      ts: s.ts, price: s.price.toString(), circulatingSupply: s.circulatingSupply.toString(), liquidityUsd: s.liquidityUsd.toString(),
      marketCap: s.marketCap.toString(), stale: s.stale ?? false,
    }));
    res.json({ market: req.params.id, tokenRef: m.tokenRef.toBase58(), threshold: m.threshold.toString(), samples });
  });

  app.get("/markets/:id/evidence", (req, res) => {
    const ev = store.getEvidence(req.params.id);
    if (!ev) { res.status(404).json({ error: "no evidence yet (market not resolved by this service)" }); return; }
    res.json(ev);
  });

  return app;
}
