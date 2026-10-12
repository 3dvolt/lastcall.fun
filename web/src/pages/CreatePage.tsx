import { MIN_LIQUIDITY_FLOOR_USD, MIN_SLOTS, MAX_SLOTS } from "@lifecycle-markets/sdk";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmModal } from "../components/ConfirmModal";
import { config } from "../config";
import { useCollateralBalance, usePools, useTokenLabel } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { useClient } from "../lib/client";
import { formatUnits, parseUnits, short, usd } from "../lib/format";
import { rememberCreatedMarket } from "../lib/labels";

const DURATIONS = [{ l: "1 hour", s: 3600 }, { l: "6 hours", s: 21600 }, { l: "1 day", s: 86400 }, { l: "3 days", s: 259200 }];
const WINDOWS = [{ l: "5 min", w: 300, i: 10 }, { l: "10 min", w: 600, i: 10 }, { l: "30 min", w: 1800, i: 30 }];

export function CreatePage() {
  const { client, connected } = useClient();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const balance = useCollateralBalance(publicKey).data;
  const { run, pending } = useTx();
  const nav = useNavigate();
  const [mintText, setMintText] = useState("");
  const [threshold, setThreshold] = useState("");
  const [dur, setDur] = useState(86400);
  const [win, setWin] = useState(WINDOWS[0]);
  const [minLiq, setMinLiq] = useState("10000");
  const [liq, setLiq] = useState("100");
  const [feeBps, setFeeBps] = useState(100);
  const [confirm, setConfirm] = useState(false);

  let mint: PublicKey | null = null;
  try { mint = mintText.trim() ? new PublicKey(mintText.trim()) : null; } catch { /* invalid */ }
  const found = usePools(mint);
  const label = useTokenLabel(mint?.toBase58()).data;
  const best = found.data?.pools[0];
  const quote = found.data?.quote;

  const th = parseUnits(threshold), lq = parseUnits(liq), ml = parseUnits(minLiq);
  const errs: string[] = [];
  if (mintText.trim() && !mint) errs.push("That is not a valid token address.");
  if (mint && found.isLoading) errs.push("Looking for the token's pool on-chain…");
  if (mint && found.isSuccess && !found.data) errs.push("No SOL-quoted PumpSwap pool was found for this token on this network.");
  if (mint && found.isError) errs.push(`Could not read the pool: ${(found.error as Error).message}`);
  if (!th || th === 0n) errs.push("Enter the market cap threshold in USD.");
  if (!ml || ml < MIN_LIQUIDITY_FLOOR_USD) errs.push("Minimum pool liquidity must be at least $5,000.");
  else if (quote && quote.liquidity < ml) errs.push(`This pool has ${usd(quote.liquidity)} of liquidity, below the minimum you set: the market would resolve VOID.`);
  if (!lq || lq === 0n) errs.push("Initial liquidity must be positive.");
  else if (balance !== undefined && lq > balance) errs.push("Not enough collateral tokens for that liquidity.");
  const slots = Math.ceil(win.w / win.i);
  if (slots < MIN_SLOTS || slots > MAX_SLOTS) errs.push("Invalid sampling window.");
  if (win.w >= dur) errs.push("The final window must be shorter than the market.");
  if (!config.collateralMint) errs.push("Collateral mint is not configured.");

  const submit = async () => {
    const expiryTs = Math.floor(Date.now() / 1000) + dur;
    let created: PublicKey | null = null;
    const sig = await run("Market created", async () => {
      const r = await client.createMarket({
        marketId: BigInt(Date.now()), tokenRef: mint!, threshold: th!, expiryTs, resolutionWindowSecs: win.w, sampleIntervalSecs: win.i,
        minLiquidityUsd: ml!, initialLiquidity: lq!, feeBps, collateralMint: config.collateralMint!, source: { kind: "pumpSwap", pool: best!.pool },
      });
      created = r.market;
      return r.signature;
    });
    if (sig && created) {
      rememberCreatedMarket((created as PublicKey).toBase58());
      nav(`/market/${(created as PublicKey).toBase58()}`);
    }
  };

  return (
    <main className="page narrow">
      <h1>Create a market</h1>
      <p className="muted">Ask whether a token will hold a market cap at expiry. The contract reads the token's price on-chain and decides the outcome itself: nobody, including you, can influence it.</p>
      <section className="card form">
        <label className="field"><span>Token address (mint)</span>
          <input value={mintText} onChange={(e) => setMintText(e.target.value)} spellCheck={false} className="mono" placeholder="Paste the token's mint address" />
          <small className="muted">Find it on DexScreener or Solscan. The token needs a SOL pool on PumpSwap.</small>
          {quote && best && (
            <div className="notice"><b>{label?.symbol ? "$" + label.symbol : short(mint!.toBase58())}</b> · market cap {usd(quote.marketCap)} · pool liquidity {usd(quote.liquidity)} · SOL ${quote.usdPerSol.toFixed(2)}
              <br /><span className="muted small">Pool {short(best.pool.toBase58())}{found.data!.pools.length > 1 ? ` (the deepest of ${found.data!.pools.length}; the market follows only this one)` : ""}</span></div>
          )}
        </label>
        <label className="field"><span>Market cap threshold (USD)</span><input inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={quote ? String(Math.round(Number(quote.marketCap) / 1e6 * 1.2)) : "1000000"} /></label>
        <div className="field"><span>Duration</span><div className="chips">{DURATIONS.map((d) => (<button key={d.s} className={dur === d.s ? "chip on" : "chip"} onClick={() => setDur(d.s)}>{d.l}</button>))}</div></div>
        <div className="field"><span>Final window that decides the outcome</span><div className="chips">{WINDOWS.map((w) => (<button key={w.w} className={win.w === w.w ? "chip on" : "chip"} onClick={() => setWin(w)}>{w.l}</button>))}</div>
          <small className="muted">The price is recorded on-chain every {win.i}s in this window ({slots} samples). Trading closes when this window opens.</small></div>
        <label className="field"><span>Minimum pool liquidity (USD)</span><input inputMode="decimal" value={minLiq} onChange={(e) => setMinLiq(e.target.value)} /><small className="muted">If the pool is thinner than this during the window, the market is voided. At least $5,000.</small></label>
        <label className="field"><span>Initial liquidity (collateral)</span><input inputMode="decimal" value={liq} onChange={(e) => setLiq(e.target.value)} /><small className="muted">Balance: {balance === undefined ? "…" : formatUnits(balance, 2)}</small></label>
        <label className="field"><span>Trading fee (basis points)</span><input type="number" min={0} max={1000} value={feeBps} onChange={(e) => setFeeBps(Number(e.target.value))} /><small className="muted">{feeBps / 100}% per trade</small></label>
        {errs.length > 0 && <ul className="notice warn">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        {connected ? <button className="btn primary block" disabled={errs.length > 0} onClick={() => setConfirm(true)}>Review & create</button>
          : <button className="btn primary block" onClick={() => setVisible(true)}>Connect wallet</button>}
      </section>
      {confirm && mint && th && lq && ml && best && (
        <ConfirmModal title="Create market" confirmLabel="Confirm in wallet" pending={pending} onCancel={() => setConfirm(false)} onConfirm={submit}
          rows={[
            { k: "Question", v: `${label?.symbol ? "$" + label.symbol : "Token"} ≥ ${usd(th)} market cap at expiry`, strong: true },
            { k: "Expires in", v: DURATIONS.find((d) => d.s === dur)?.l ?? `${dur}s` },
            { k: "You deposit", v: `${formatUnits(lq, 6)} collateral`, strong: true },
            { k: "Price source", v: <span className="mono small">PumpSwap pool {best.pool.toBase58()}</span> },
            { k: "Fee", v: `${feeBps / 100}%` },
          ]}
          warning="The outcome is decided by the contract from on-chain prices of this pool. A thin or manipulable pool can be pushed around by traders: check the liquidity above." />
      )}
    </main>
  );
}
