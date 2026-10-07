import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Keypair, PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { config } from "../config";
import { useCollateralBalance, useHealth } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { useClient } from "../lib/client";
import { formatUnits, parseUnits, usd } from "../lib/format";

const DURATIONS = [{ l: "5 min", s: 300 }, { l: "10 min", s: 600 }, { l: "1 hour", s: 3600 }, { l: "1 day", s: 86400 }];

export function CreatePage() {
  const { client, connected } = useClient();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const balance = useCollateralBalance(publicKey).data;
  const health = useHealth().data;
  const { run, pending } = useTx();
  const nav = useNavigate();
  const [tokenRef, setTokenRef] = useState(() => Keypair.generate().publicKey.toBase58());
  const [threshold, setThreshold] = useState("1000000");
  const [dur, setDur] = useState(600);
  const [windowSecs, setWindowSecs] = useState(120);
  const [liq, setLiq] = useState("1000");
  const [feeBps, setFeeBps] = useState(100);
  const [confirm, setConfirm] = useState(false);

  let ref: PublicKey | null = null;
  try { ref = new PublicKey(tokenRef.trim()); } catch { /* invalid */ }
  const th = parseUnits(threshold), lq = parseUnits(liq);
  // pinned key from build config; the API's /health is only used as a consistency check
  const resolver = config.resolver ?? null;
  const apiMismatch = !!(health?.resolver && config.resolver && health.resolver !== config.resolver.toBase58());
  const errs: string[] = [];
  if (!ref) errs.push("Token reference must be a valid address.");
  if (!th || th === 0n) errs.push("Threshold must be a positive number.");
  if (!lq || lq === 0n) errs.push("Initial liquidity must be a positive number.");
  else if (balance !== undefined && lq > balance) errs.push("Not enough test tokens for that liquidity.");
  if (windowSecs < 30 || windowSecs >= dur) errs.push("The resolution window must be at least 30s and shorter than the market duration.");
  if (feeBps < 0 || feeBps > 1000) errs.push("Fee must be between 0 and 10%.");
  if (!resolver) errs.push("VITE_RESOLVER_PUBKEY is not configured.");
  if (apiMismatch) errs.push("The resolver service reports a different key than this app trusts. Do not create markets.");
  if (!config.collateralMint) errs.push("Collateral mint is not configured.");

  const submit = async () => {
    const marketId = BigInt(Date.now());
    const expiryTs = Math.floor(Date.now() / 1000) + dur;
    let created: PublicKey | null = null;
    const sig = await run("Market created", async () => {
      const r = await client.createMarket({ marketId, tokenRef: ref!, threshold: th!, expiryTs, resolutionWindowSecs: windowSecs, initialLiquidity: lq!, feeBps, collateralMint: config.collateralMint!, resolver: resolver! });
      created = r.market;
      return r.signature;
    });
    if (sig && created) nav(`/market/${(created as PublicKey).toBase58()}`);
  };

  return (
    <main className="page narrow">
      <h1>Create a market</h1>
      <p className="muted">Ask whether a token will reach a market cap at expiry. You seed the pool and earn trading fees plus what is left in the pool at the end.</p>
      <section className="card form">
        <label className="field"><span>Token reference</span>
          <div className="input-row"><input value={tokenRef} onChange={(e) => setTokenRef(e.target.value)} spellCheck={false} className="mono" />
            <button className="btn ghost sm" onClick={() => setTokenRef(Keypair.generate().publicKey.toBase58())}>New</button></div>
          <small className="muted">Identifier of the tracked token. The demo feed for this address supplies its price.</small></label>
        <label className="field"><span>Market cap threshold (USD)</span><input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></label>
        <div className="field"><span>Duration</span><div className="chips">{DURATIONS.map((d) => (<button key={d.s} className={dur === d.s ? "chip on" : "chip"} onClick={() => setDur(d.s)}>{d.l}</button>))}</div></div>
        <label className="field"><span>Resolution window (seconds)</span><input type="number" min={30} value={windowSecs} onChange={(e) => setWindowSecs(Number(e.target.value))} /><small className="muted">The final stretch before expiry that decides the outcome.</small></label>
        <label className="field"><span>Initial liquidity (test tokens)</span><input inputMode="decimal" value={liq} onChange={(e) => setLiq(e.target.value)} /><small className="muted">Balance: {balance === undefined ? "…" : formatUnits(balance, 2)}</small></label>
        <label className="field"><span>Trading fee (basis points)</span><input type="number" min={0} max={1000} value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} /><small className="muted">{feeBps / 100}% per trade</small></label>
        {errs.length > 0 && <ul className="notice warn">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        {connected ? <button className="btn primary block" disabled={errs.length > 0} onClick={() => setConfirm(true)}>Review & create</button>
          : <button className="btn primary block" onClick={() => setVisible(true)}>Connect wallet</button>}
      </section>
      {confirm && ref && th && lq && resolver && (
        <ConfirmModal title="Create market" confirmLabel="Confirm in wallet" pending={pending} onCancel={() => setConfirm(false)} onConfirm={submit}
          rows={[
            { k: "Question", v: `Token ≥ ${usd(th)} market cap at expiry`, strong: true },
            { k: "Expires in", v: DURATIONS.find((d) => d.s === dur)?.l ?? `${dur}s` },
            { k: "You deposit", v: `${formatUnits(lq, 6)} test tokens`, strong: true },
            { k: "Fee", v: `${feeBps / 100}%` },
            { k: "Resolver", v: <span className="mono small">{resolver.toBase58()}</span> },
          ]}
          warning="The resolver is a single centralized key and the price feed is a demo feed. This is a devnet demo." />
      )}
    </main>
  );
}
