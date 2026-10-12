import type { Express, Request, Response, NextFunction } from "express";

export interface HardenOptions {
  /** exact origins allowed to call the API from a browser; empty/undefined = "*" (development only) */
  allowedOrigins?: string[];
  /** number of reverse proxies in front (1 behind Caddy / ALB). 0 = none: req.ip is the socket address. */
  trustProxy?: number;
  /** requests per minute per client IP */
  ratePerMinute?: number;
  /** allow POST (faucet); the resolver API is read-only */
  allowPost?: boolean;
}

/** Shared hardening for the public HTTP services (resolver API, faucet). */
export function hardenApp(app: Express, o: HardenOptions = {}) {
  app.disable("x-powered-by");
  app.set("trust proxy", o.trustProxy ?? 0); // required so rate limits see the real client, not the proxy
  const allowed = o.allowedOrigins?.filter(Boolean) ?? [];
  const methods = o.allowPost ? ["GET", "POST", "OPTIONS"] : ["GET", "OPTIONS"];

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (allowed.length === 0) res.setHeader("Access-Control-Allow-Origin", "*");
    else if (origin && allowed.includes(origin)) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
    res.setHeader("Access-Control-Allow-Methods", methods.join(", "));
    res.setHeader("Access-Control-Allow-Headers", "content-type");
    res.setHeader("Access-Control-Max-Age", "600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "OPTIONS") { res.sendStatus(204); return; }
    // reject disallowed methods and, in production, browser requests from other origins
    if (!methods.includes(req.method)) { res.status(405).json({ error: "method not allowed" }); return; }
    if (allowed.length > 0 && origin && !allowed.includes(origin)) { res.status(403).json({ error: "origin not allowed" }); return; }
    next();
  });

  const limit = o.ratePerMinute ?? 120;
  const hits = new Map<string, { n: number; reset: number }>();
  app.use((req, res, next) => {
    const now = Date.now(), ip = req.ip ?? "?";
    const h = hits.get(ip);
    if (!h || h.reset < now) hits.set(ip, { n: 1, reset: now + 60_000 });
    else if (++h.n > limit) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "rate limit" }); return; }
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
    next();
  });
}

export const originsFromEnv = (v: string | undefined): string[] => (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
