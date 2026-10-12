import type { LiveQuote } from "../hooks/queries";
import { pct, usd } from "../lib/format";

/** "Right now" strip: the price the program would record at this moment, read on-chain, vs the threshold. */
export function LiveStats({ quote, threshold, now, live, error }: { quote: LiveQuote | undefined; threshold: bigint; now: number; live: boolean; error?: boolean }) {
  if (!quote) return <div className="livestats muted small">{error ? "Could not read the price source right now." : "Reading the price from the chain…"}</div>;
  const ratio = Number((quote.marketCap * 10_000n) / threshold) / 10_000;
  const age = Math.max(0, now - quote.at);
  const fresh = live && age < 45;
  return (
    <div className="livestats">
      <div className="ls-main">
        <span className={fresh ? "live-dot on" : "live-dot"} aria-hidden />
        <div>
          <div className="muted small">{fresh ? "LIVE" : "Last price"} · market cap (on-chain)</div>
          <b className="ls-value">{usd(quote.marketCap)}</b>
        </div>
        <div className={ratio >= 1 ? "ls-ratio ok" : "ls-ratio"}>{pct(ratio)} <small>of threshold</small></div>
      </div>
      <div className="ls-bar" role="img" aria-label={`${pct(ratio)} of threshold`}><div className={ratio >= 1 ? "ls-fill up" : "ls-fill"} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
      <div className="ls-foot muted small"><span>Pool liquidity {usd(quote.liquidity)}</span><span>{live ? `read ${age}s ago` : "market closed"}</span></div>
    </div>
  );
}
