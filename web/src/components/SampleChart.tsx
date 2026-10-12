import { useMemo, useState } from "react";
import { usd } from "../lib/format";

export interface ChartSample { ts: number; marketCap: string }

const compact = (v: number) => (v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}k` : `$${Math.round(v)}`);
const clock = (ts: number, withDay: boolean) => {
  const d = new Date(ts * 1000);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return withDay ? `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${t}` : t;
};

/**
 * Live market-cap chart: line + area, current-value marker, threshold line, shaded resolution window,
 * time axis and a hover read-out. No dependencies.
 */
export function SampleChart({ samples, threshold, windowStart, expiry, live }: { samples: ChartSample[]; threshold: bigint; windowStart: number; expiry: number; live: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const [full, setFull] = useState(!live); // live markets default to a zoomed view that follows the data
  const W = 640, H = 240, P = { l: 58, r: 14, t: 14, b: 28 };

  const m = useMemo(() => {
    if (samples.length < 2) return null;
    const pts = samples.map((s) => ({ t: s.ts, v: Number(BigInt(s.marketCap)) / 1e6 }));
    const th = Number(threshold) / 1e6;
    const lastT = pts[pts.length - 1].t;
    const t0 = full ? Math.min(pts[0].t, windowStart) : pts[0].t;
    const t1 = full ? Math.max(lastT, expiry) : Math.min(Math.max(lastT, expiry), lastT + Math.max(30, (lastT - pts[0].t) * 0.12));
    // axis fitted to the data and the threshold (not forced to start at 0) so real movement is visible
    const vals = pts.map((p) => p.v);
    const lo = Math.min(th, ...vals), hi = Math.max(th, ...vals);
    const span = hi - lo || hi * 0.1 || 1;
    const vmin = Math.max(0, lo - span * 0.3), vmax = hi + span * 0.3;
    const x = (t: number) => P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
    const xc = (t: number) => Math.min(W - P.r, Math.max(P.l, x(t)));
    const y = (v: number) => P.t + (1 - (v - vmin) / (vmax - vmin)) * (H - P.t - P.b);
    const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
    const last = pts[pts.length - 1];
    const area = `${line} L${x(last.t).toFixed(1)},${y(vmin)} L${x(pts[0].t).toFixed(1)},${y(vmin)} Z`;
    return { pts, th, t0, t1, vmin, vmax, x, xc, y, line, area, last };
  }, [samples, threshold, windowStart, expiry, full]);

  if (!m) return <div className="chart-empty">Waiting for price samples from the resolver…</div>;
  const { pts, th, t0, t1, vmin, vmax, x, xc, y, line, area, last } = m;
  const showWinLabel = x(windowStart) > P.l + 70 && x(windowStart) < W - P.r - 80;
  const multiDay = t1 - t0 > 86_400;
  const h = hover !== null ? pts[hover] : null;
  const above = last.v >= th;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0, bd = Infinity;
    pts.forEach((p, i) => { const d = Math.abs(x(p.t) - px); if (d < bd) { bd = d; best = i; } });
    setHover(best);
  };

  return (
    <div className="chart-wrap">
      <div className="chart-toggle" role="group" aria-label="Chart range">
        <button className={!full ? "on" : ""} onClick={() => setFull(false)}>Live</button>
        <button className={full ? "on" : ""} onClick={() => setFull(true)}>Until expiry</button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="Market cap over time versus the threshold" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity="0.28" /><stop offset="1" stopColor="var(--brand)" stopOpacity="0" /></linearGradient>
        </defs>
        <rect x={xc(windowStart)} y={P.t} width={Math.max(0, xc(expiry) - xc(windowStart))} height={H - P.t - P.b} className="chart-window" />
        {[0, 0.5, 1].map((f) => { const v = vmin + (vmax - vmin) * f; return (<g key={f}><line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={P.l - 6} y={y(v) + 4} textAnchor="end" className="chart-label">{compact(v)}</text></g>); })}
        <line x1={P.l} x2={W - P.r} y1={y(th)} y2={y(th)} className="chart-threshold" />
        <text x={W - P.r} y={y(th) - 6} textAnchor="end" className="chart-label strong">Threshold {usd(threshold)}</text>
        <path d={area} fill="url(#lc-area)" />
        <path d={line} className="chart-line" fill="none" />
        {/* time axis */}
        <text x={P.l} y={H - 8} className="chart-label">{clock(t0, multiDay)}</text>
        {showWinLabel && <text x={x(windowStart)} y={H - 8} textAnchor="middle" className="chart-label">resolution window →</text>}
        <text x={W - P.r} y={H - 8} textAnchor="end" className="chart-label">{clock(t1, multiDay)}</text>
        {/* current value */}
        {live && <circle cx={x(last.t)} cy={y(last.v)} r="9" className="chart-pulse" />}
        <circle cx={x(last.t)} cy={y(last.v)} r="4" className={above ? "chart-dot up" : "chart-dot down"} />
        {h && (<g><line x1={x(h.t)} x2={x(h.t)} y1={P.t} y2={H - P.b} className="chart-cross" /><circle cx={x(h.t)} cy={y(h.v)} r="4.5" className="chart-hover-dot" /></g>)}
      </svg>
      {h && (
        <div className="chart-tip" style={{ left: `${(x(h.t) / W) * 100}%` }}>
          <b>{compact(h.v)}</b><span>{clock(h.t, true)}</span>
        </div>
      )}
    </div>
  );
}
