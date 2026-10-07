import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { Link, useParams } from "react-router-dom";
import { EvidencePanel } from "../components/EvidencePanel";
import { OddsBar } from "../components/OddsBar";
import { PositionPanel } from "../components/PositionPanel";
import { SampleChart } from "../components/SampleChart";
import { TradePanel } from "../components/TradePanel";
import { explorerAddr } from "../config";
import { isTrusted, useCollateralBalance, useMarket, useNow, usePosition, useSamples } from "../hooks/queries";
import { countdown, formatUnits, short, usd } from "../lib/format";
import { marketTitle, statusInfo, yesProb } from "../lib/market";

const validKey = (s: string | undefined) => { try { return s ? new PublicKey(s).toBase58() : undefined; } catch { return undefined; } };

export function MarketPage() {
  const id = validKey(useParams().id);
  const { publicKey } = useWallet();
  const market = useMarket(id);
  const m = market.data;
  const position = usePosition(m?.address, publicKey);
  const balance = useCollateralBalance(publicKey).data;
  const samples = useSamples(id, m?.status === "open");
  const now = useNow();

  if (!id) return <main className="page"><p className="notice warn">Invalid market address.</p></main>;
  if (market.isLoading) return <main className="page"><div className="card skeleton tall" /></main>;
  if (!m) return <main className="page"><p className="notice warn">Market not found on this network.</p><Link to="/">← All markets</Link></main>;

  const untrusted = !isTrusted(m);
  const st = statusInfo(m, now);
  const expiry = Number(m.expiryTs);
  return (
    <main className="page two-col">
      <div className="col">
        <Link to="/" className="muted small">← All markets</Link>
        <div className="title-row"><h1>{marketTitle(m)}</h1><span className={`pill ${st.tone}`}>{st.label}</span></div>
        {untrusted && <p className="notice warn"><b>Untrusted market.</b> It uses a resolver or collateral token that this app does not vouch for. Its creator may be able to decide the outcome. Trading is disabled.</p>}
        <OddsBar yes={yesProb(m)} />
        <div className="stats">
          <div><span className="muted small">Threshold</span><b>{usd(m.threshold)}</b></div>
          <div><span className="muted small">{m.status === "open" ? "Time left" : "Ended"}</span><b>{m.status === "open" ? countdown(expiry - now) : new Date(expiry * 1000).toLocaleString()}</b></div>
          <div><span className="muted small">Pool size</span><b>{formatUnits(m.totalMinted, 0)}</b></div>
          <div><span className="muted small">Fee</span><b>{m.feeBps / 100}%</b></div>
        </div>
        <section className="card">
          <h2>Market cap vs threshold</h2>
          <SampleChart samples={samples.data ?? []} threshold={m.threshold} windowStart={expiry - m.resolutionWindowSecs} expiry={expiry} />
          <p className="muted small">Only the shaded final {m.resolutionWindowSecs >= 120 ? `${Math.round(m.resolutionWindowSecs / 60)}-minute` : `${m.resolutionWindowSecs}-second`} window decides the outcome. Data source: demo price feed (mock).</p>
        </section>
        <EvidencePanel market={m} />
        <p className="muted small">Market <a href={explorerAddr(m.address.toBase58())} target="_blank" rel="noopener noreferrer">{short(m.address.toBase58())}</a> · token ref {short(m.tokenRef.toBase58())} · resolver {short(m.resolver.toBase58())}</p>
      </div>
      <aside className="col side-col">
        {untrusted ? null : <TradePanel market={m} position={position.data} balance={balance} now={now} />}
        <PositionPanel market={m} position={position.data} wallet={publicKey} />
      </aside>
    </main>
  );
}
