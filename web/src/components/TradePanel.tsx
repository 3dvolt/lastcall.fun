import { MathError, priceNo, priceYes, type MarketAccount, type PositionAccount, type Side } from "@lifecycle-markets/sdk";
import { useMemo, useState } from "react";
import { useClient } from "../lib/client";
import { useTx } from "../hooks/useTx";
import { formatUnits, parseUnits, pct, withSlippage } from "../lib/format";
import { isTradable } from "../lib/market";
import { ConfirmModal } from "./ConfirmModal";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

const SLIPPAGE = [50, 100, 300];

export function TradePanel({ market, position, balance, now }: { market: MarketAccount; position: PositionAccount | null | undefined; balance: bigint | undefined; now: number }) {
  const { client, connected } = useClient();
  const { setVisible } = useWalletModal();
  const { run, pending } = useTx();
  const [mode, setMode] = useState<"buy" | "sell">("buy");
  const [side, setSide] = useState<Side>("yes");
  const [text, setText] = useState("");
  const [slipBps, setSlipBps] = useState(100);
  const [confirm, setConfirm] = useState(false);

  const tradable = isTradable(market, now);
  const held = side === "yes" ? position?.yesShares ?? 0n : position?.noShares ?? 0n;
  const amount = parseUnits(text);
  const p = side === "yes" ? priceYes(market.yesReserve, market.noReserve) : priceNo(market.yesReserve, market.noReserve);

  const calc = useMemo(() => {
    if (!text) return { kind: "empty" as const };
    if (amount === null) return { kind: "error" as const, msg: "Enter a number with up to 6 decimals." };
    if (amount === 0n) return { kind: "error" as const, msg: "Amount must be greater than zero." };
    try {
      if (mode === "buy") {
        const q = client.quoteBuy(market, side, amount);
        return { kind: "buy" as const, q, minOut: withSlippage(q.sharesOut, slipBps) };
      }
      const q = client.quoteSell(market, side, amount);
      return { kind: "sell" as const, q, minOut: withSlippage(q.payout, slipBps) };
    } catch (e) {
      return { kind: "error" as const, msg: e instanceof MathError ? "That amount is too small or too large for this pool." : "Could not price this trade." };
    }
  }, [text, amount, mode, side, market, client, slipBps]);

  let blocker: string | null = null;
  if (!tradable) blocker = market.status === "open" ? "Trading is closed: the market has expired." : "This market is resolved.";
  else if (calc.kind === "error") blocker = calc.msg;
  else if (calc.kind === "buy" && balance !== undefined && amount! > balance) blocker = "Not enough test tokens. Use the faucet.";
  else if (calc.kind === "sell" && amount! > held) blocker = `You only hold ${formatUnits(held, 4)} ${side.toUpperCase()} shares.`;

  const submit = async () => {
    if (calc.kind !== "buy" && calc.kind !== "sell") return;
    const sig = await run(mode === "buy" ? "Buy" : "Sell", () => mode === "buy" ? client.buy(market, side, amount!, calc.minOut) : client.sell(market, side, amount!, calc.minOut));
    if (sig) { setConfirm(false); setText(""); }
  };

  const avgPrice = calc.kind === "buy" ? Number(amount) / Number(calc.q.sharesOut) : calc.kind === "sell" ? Number(calc.q.payout) / Number(amount) : 0;
  const impact = calc.kind === "buy" || calc.kind === "sell" ? Math.abs(avgPrice - p) / Math.max(p, 1e-9) : 0;

  return (
    <section className="card trade">
      <div className="tabs" role="tablist">
        {(["buy", "sell"] as const).map((m) => (<button key={m} role="tab" aria-selected={mode === m} className={mode === m ? "tab active" : "tab"} onClick={() => { setMode(m); setText(""); }}>{m === "buy" ? "Buy" : "Sell"}</button>))}
      </div>
      <div className="sides">
        <button className={`side yes ${side === "yes" ? "on" : ""}`} onClick={() => setSide("yes")} aria-pressed={side === "yes"}>YES <small>{pct(priceYes(market.yesReserve, market.noReserve))}</small></button>
        <button className={`side no ${side === "no" ? "on" : ""}`} onClick={() => setSide("no")} aria-pressed={side === "no"}>NO <small>{pct(priceNo(market.yesReserve, market.noReserve))}</small></button>
      </div>

      <label className="field">
        <span>{mode === "buy" ? "Amount to spend (test tokens)" : `Shares to sell (you hold ${formatUnits(held, 4)})`}</span>
        <div className="input-row">
          <input inputMode="decimal" autoComplete="off" placeholder="0.00" value={text} onChange={(e) => setText(e.target.value.replace(/,/g, "."))} aria-invalid={calc.kind === "error"} />
          <button type="button" className="btn ghost sm" onClick={() => setText(formatUnits(mode === "buy" ? balance ?? 0n : held, 6).replace(/,/g, ""))}>Max</button>
        </div>
      </label>

      {(calc.kind === "buy" || calc.kind === "sell") && (
        <dl className="rows compact">
          {calc.kind === "buy" ? (
            <>
              <div className="row"><dt>You receive</dt><dd>{formatUnits(calc.q.sharesOut, 4)} {side.toUpperCase()} shares</dd></div>
              <div className="row"><dt>Average price</dt><dd>{avgPrice.toFixed(3)} per share</dd></div>
              <div className="row"><dt>If {side.toUpperCase()} wins</dt><dd className="ok">{formatUnits(calc.q.sharesOut, 2)} tokens (+{formatUnits(calc.q.sharesOut - amount!, 2)})</dd></div>
              <div className="row"><dt>If it loses</dt><dd className="bad">0 tokens</dd></div>
              <div className="row"><dt>Fee</dt><dd>{formatUnits(calc.q.fee, 4)} ({market.feeBps / 100}%)</dd></div>
            </>
          ) : (
            <>
              <div className="row"><dt>You receive</dt><dd>{formatUnits(calc.q.payout, 4)} tokens</dd></div>
              <div className="row"><dt>Average price</dt><dd>{avgPrice.toFixed(3)} per share</dd></div>
              <div className="row"><dt>Fee</dt><dd>{formatUnits(calc.q.fee, 4)} ({market.feeBps / 100}%)</dd></div>
            </>
          )}
          <div className="row"><dt>Price impact</dt><dd className={impact > 0.1 ? "bad" : ""}>{pct(impact)}</dd></div>
        </dl>
      )}

      <div className="slip">
        <span className="muted small">Slippage tolerance</span>
        {SLIPPAGE.map((s) => (<button key={s} className={slipBps === s ? "chip on" : "chip"} onClick={() => setSlipBps(s)}>{s / 100}%</button>))}
      </div>

      {blocker && text && <p className="notice warn">{blocker}</p>}
      {!tradable && !text && <p className="notice">{blocker}</p>}

      {!connected ? (
        <button className="btn primary block" onClick={() => setVisible(true)}>Connect wallet to trade</button>
      ) : (
        <button className="btn primary block" disabled={!!blocker || calc.kind === "empty"} onClick={() => setConfirm(true)}>{mode === "buy" ? `Buy ${side.toUpperCase()}` : `Sell ${side.toUpperCase()}`}</button>
      )}

      {confirm && (calc.kind === "buy" || calc.kind === "sell") && (
        <ConfirmModal
          title={`${mode === "buy" ? "Buy" : "Sell"} ${side.toUpperCase()}`}
          confirmLabel="Confirm in wallet"
          pending={pending}
          onCancel={() => setConfirm(false)}
          onConfirm={submit}
          warning={impact > 0.1 ? `High price impact (${pct(impact)}). Consider a smaller amount.` : undefined}
          rows={calc.kind === "buy" ? [
            { k: "You pay", v: `${formatUnits(amount!, 6)} tokens`, strong: true },
            { k: "You receive (estimate)", v: `${formatUnits(calc.q.sharesOut, 6)} ${side.toUpperCase()} shares` },
            { k: `Minimum you'll accept (${slipBps / 100}% slippage)`, v: `${formatUnits(calc.minOut, 6)} shares` },
            { k: "Fee included", v: `${formatUnits(calc.q.fee, 6)} tokens` },
          ] : [
            { k: "You sell", v: `${formatUnits(amount!, 6)} ${side.toUpperCase()} shares`, strong: true },
            { k: "You receive (estimate)", v: `${formatUnits(calc.q.payout, 6)} tokens` },
            { k: `Minimum you'll accept (${slipBps / 100}% slippage)`, v: `${formatUnits(calc.minOut, 6)} tokens` },
            { k: "Fee included", v: `${formatUnits(calc.q.fee, 6)} tokens` },
          ]}
        />
      )}
    </section>
  );
}
