import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { LiveStats } from "../components/LiveStats";
import { OddsBar } from "../components/OddsBar";
import { PositionPanel } from "../components/PositionPanel";
import { ResolutionPanel } from "../components/ResolutionPanel";
import { SampleChart, type ChartSample } from "../components/SampleChart";
import { TradePanel } from "../components/TradePanel";
import { explorerAddr } from "../config";
import { isTrusted, useCollateralBalance, useLiveHistory, useLiveQuote, useMarket, useNow, usePosition, useSampleBuffer, useTokenLabel } from "../hooks/queries";
import { countdown, formatUnits, short, usd } from "../lib/format";
import { marketTitle, statusInfo, tradingEnds, yesProb } from "../lib/market";

const validKey = (s: string | undefined) => { try { return s ? new PublicKey(s).toBase58() : undefined; } catch { return undefined; } };

export function MarketPage() {
  const id = validKey(useParams().id);
  const { publicKey } = useWallet();
  const market = useMarket(id);
  const m = market.data ?? undefined;
  const position = usePosition(m?.address, publicKey);
  const balance = useCollateralBalance(publicKey).data;
  const now = useNow();
  const open = !!m && m.status === "open" && now < Number(m.expiryTs);
  const quote = useLiveQuote(m, !!m && m.status === "open");
  const buf = useSampleBuffer(m);
  const history = useLiveHistory(id, quote.data);
  const label = useTokenLabel(m?.tokenRef.toBase58()).data;

  // chart data: what this browser has seen (display only) + the prices recorded ON-CHAIN in the final window
  const chart = useMemo<ChartSample[]>(() => {
    if (!m) return [];
    const pts = new Map<number, string>();
    history.forEach((h) => pts.set(h.t, h.v.toString()));
    const b = buf.data;
    if (b) {
      const ws = Number(m.expiryTs) - m.resolutionWindowSecs;
      b.filled.forEach((f, i) => { if (f) pts.set(ws + i * m.sampleIntervalSecs, b.mcap[i].toString()); });
    }
    return [...pts.entries()].sort((a, b2) => a[0] - b2[0]).map(([ts, marketCap]) => ({ ts, marketCap }));
  }, [history, buf.data, m]);

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
        <div className="title-row"><h1>{marketTitle(m, label?.symbol)}</h1><span className={`pill ${st.tone}`}>{st.label}</span></div>
        {untrusted && <p className="notice warn"><b>Unrecognised market.</b> It uses a collateral token or price source that this app does not vouch for. Trading is disabled.</p>}
        <OddsBar yes={yesProb(m)} />
        <div className="stats">
          <div><span className="muted small">Threshold</span><b>{usd(m.threshold)}</b></div>
          <div><span className="muted small">{m.status !== "open" ? "Ended" : now < tradingEnds(m) ? "Trading closes in" : "Resolves in"}</span><b>{m.status !== "open" ? new Date(expiry * 1000).toLocaleString() : countdown((now < tradingEnds(m) ? tradingEnds(m) : expiry) - now)}</b></div>
          <div><span className="muted small">Pool size</span><b>{formatUnits(m.totalMinted, 0)}</b></div>
          <div><span className="muted small">Fee</span><b>{m.feeBps / 100}%</b></div>
        </div>
        <section className="card">
          <h2 style={{ marginBottom: 14 }}>Market cap vs threshold</h2>
          <LiveStats quote={quote.data} threshold={m.threshold} now={now} live={open} error={quote.isError} />
          <SampleChart samples={chart} threshold={m.threshold} windowStart={expiry - m.resolutionWindowSecs} expiry={expiry} live={open} />
          <p className="muted small">
            Only the shaded final {m.resolutionWindowSecs >= 120 ? `${Math.round(m.resolutionWindowSecs / 60)}-minute` : `${m.resolutionWindowSecs}-second`} window decides the outcome.
            Before it, the line shows what this browser has observed; inside it, the prices recorded on-chain.
          </p>
        </section>
        <ResolutionPanel market={m} buf={buf.data} now={now} />
        <p className="muted small">Market <a href={explorerAddr(m.address.toBase58())} target="_blank" rel="noopener noreferrer">{short(m.address.toBase58())}</a> · token {short(m.tokenRef.toBase58())} · pool {short(m.sourcePool.toBase58())}</p>
      </div>
      <aside className="col side-col">
        {untrusted ? null : <TradePanel market={m} position={position.data} balance={balance} now={now} />}
        <PositionPanel market={m} position={position.data} wallet={publicKey} />
      </aside>
    </main>
  );
}
