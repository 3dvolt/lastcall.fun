import type { ApiSample } from "../lib/api";
import { usd } from "../lib/format";

/** Market-cap line chart (SVG, no deps) with the threshold line and the resolution window shaded. */
export function SampleChart({ samples, threshold, windowStart, expiry }: { samples: ApiSample[]; threshold: bigint; windowStart: number; expiry: number }) {
  if (samples.length < 2) return <div className="chart-empty">Waiting for price samples from the resolver…</div>;
  const W = 640, H = 220, P = { l: 56, r: 12, t: 12, b: 24 };
  const pts = samples.map((s) => ({ t: s.ts, v: Number(BigInt(s.marketCap)) / 1e6, stale: s.stale }));
  const th = Number(threshold) / 1e6;
  const t0 = Math.min(pts[0].t, windowStart), t1 = Math.max(pts[pts.length - 1].t, expiry);
  const vmax = Math.max(th * 1.15, ...pts.map((p) => p.v)) * 1.05;
  const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - v / vmax) * (H - P.t - P.b);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}k`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Market cap over time versus the threshold">
      <rect x={x(windowStart)} y={P.t} width={Math.max(0, x(expiry) - x(windowStart))} height={H - P.t - P.b} className="chart-window" />
      {[0, 0.5, 1].map((f) => (<g key={f}><line x1={P.l} x2={W - P.r} y1={y(vmax * f)} y2={y(vmax * f)} className="chart-grid" /><text x={P.l - 6} y={y(vmax * f) + 4} textAnchor="end" className="chart-label">{fmt(vmax * f)}</text></g>))}
      <line x1={P.l} x2={W - P.r} y1={y(th)} y2={y(th)} className="chart-threshold" />
      <text x={W - P.r} y={y(th) - 5} textAnchor="end" className="chart-label strong">Threshold {usd(threshold)}</text>
      <path d={path} className="chart-line" fill="none" />
      <text x={x(windowStart) > W - 130 ? W - P.r : x(windowStart) + 4} y={H - 8} textAnchor={x(windowStart) > W - 130 ? "end" : "start"} className="chart-label">resolution window</text>
    </svg>
  );
}
