import { Link } from "react-router-dom";
import { useState } from "react";
import { OddsBar } from "../components/OddsBar";
import { useMarkets, useNow } from "../hooks/queries";
import { countdown, formatUnits, usd } from "../lib/format";
import { marketTitle, statusInfo, yesProb } from "../lib/market";

type Filter = "live" | "resolved" | "all";

export function MarketsPage() {
  const { data, isLoading, error } = useMarkets();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("live");
  const list = (data ?? [])
    .filter((m) => (filter === "all" ? true : filter === "live" ? m.status === "open" : m.status !== "open"))
    .sort((a, b) => Number(a.expiryTs - b.expiryTs));

  return (
    <main className="page">
      <div className="page-head">
        <div><h1>Last call.</h1><p className="muted">Will this new token still be standing when the bell rings? Bet YES or NO on its market cap at expiry. Only what holds through the final window counts: last-second pumps don't.</p></div>
        <div className="tabs small">{(["live", "resolved", "all"] as const).map((f) => (<button key={f} className={filter === f ? "tab active" : "tab"} onClick={() => setFilter(f)}>{f[0].toUpperCase() + f.slice(1)}</button>))}</div>
      </div>
      {isLoading && <div className="grid">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>}
      {error && <p className="notice warn">Could not load markets. Check the RPC connection.</p>}
      {!isLoading && !error && list.length === 0 && <div className="card empty"><p>No {filter === "all" ? "" : filter} markets yet.</p><Link className="btn primary" to="/create">Create the first one</Link></div>}
      <div className="grid">
        {list.map((m) => {
          const st = statusInfo(m, now);
          return (
            <Link key={m.address.toBase58()} to={`/market/${m.address.toBase58()}`} className="card market-card">
              <div className="card-top"><span className={`pill ${st.tone}`}>{st.label}</span><span className="muted small">{m.status === "open" ? countdown(Number(m.expiryTs) - now) : ""}</span></div>
              <h3>{marketTitle(m)}</h3>
              <OddsBar yes={yesProb(m)} />
              <div className="meta"><span>Threshold {usd(m.threshold)}</span><span>Pool {formatUnits(m.totalMinted, 0)}</span></div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
