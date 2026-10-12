import { type MarketAccount, type SampleBufferAccount } from "@lifecycle-markets/sdk";
import { useClient } from "../lib/client";
import { useTx } from "../hooks/useTx";
import { usePreview } from "../hooks/queries";
import { explorerAddr } from "../config";
import { pct, short, usd } from "../lib/format";

const Check = ({ ok, label }: { ok: boolean; label: string }) => (<li className={ok ? "ok" : "bad"}><span aria-hidden>{ok ? "✓" : "✗"}</span> {label}</li>);

/**
 * How the market resolves. There is NO resolver: the program reads on-chain prices into time slots during the final window,
 * and after expiry ANYONE can trigger the resolution; the program applies the public rule to the recorded samples.
 */
export function ResolutionPanel({ market, buf, now }: { market: MarketAccount; buf: SampleBufferAccount | null | undefined; now: number }) {
  const { client, connected } = useClient();
  const { run, pending } = useTx();
  const resolved = market.status !== "open";
  const expiry = Number(market.expiryTs);
  const windowStart = expiry - market.resolutionWindowSecs;
  const inWindow = !resolved && now >= windowStart && now < expiry;
  const expired = !resolved && now >= expiry;
  const preview = usePreview(market, buf);
  const slot = Math.floor((now - windowStart) / market.sampleIntervalSecs);
  const slotFree = inWindow && buf && slot >= 0 && slot < market.sampleSlots && !buf.filled[slot];

  const slots = market.sampleSlots;
  const cov = resolved ? market.resSamples : buf?.count ?? 0;
  const covOk = cov * 5 >= slots * 4;
  const liq = resolved ? market.resLiqMedian : preview?.stats.liqMedian ?? 0n;
  const twap = resolved ? market.resTwap : preview?.stats.twap ?? 0n;
  const above = resolved ? market.resAbove : preview?.stats.above ?? 0;
  const showChecks = (resolved && market.resSamples > 0) || (!resolved && cov > 0);

  return (
    <section className="card">
      <h2>How it resolves</h2>
      <p className="muted">A token only counts as <b>YES</b> if its market cap stays above the threshold for the whole final window, not just for a few seconds. The rule runs <b>inside the smart contract</b>, on prices it reads itself from the chain.</p>
      <ol className="rules">
        <li><b>Void</b> if the pool is too thin or too many price samples are missing (under 80%).</li>
        <li><b>Yes</b> only if the average (TWAP) is above the threshold <i>and</i> at least 90% of samples are.</li>
        <li><b>No</b> otherwise.</li>
      </ol>

      {!resolved && !inWindow && !expired && <p className="notice">The final {market.resolutionWindowSecs >= 120 ? `${Math.round(market.resolutionWindowSecs / 60)} minutes` : `${market.resolutionWindowSecs} seconds`} will be sampled on-chain every {market.sampleIntervalSecs}s.</p>}
      {inWindow && <p className="notice"><b>Final window in progress.</b> {cov}/{slots} prices recorded. Anyone can record the price for the current slot.</p>}
      {slotFree && connected && <button className="btn sm" disabled={pending} onClick={() => run("Price recorded", () => client.recordSample(market))}>{pending ? "…" : "Record the price now"}</button>}
      {expired && (
        <>
          <p className="notice warn"><b>The market has ended and is waiting to be resolved.</b> Anyone can trigger it: the contract decides from the recorded samples ({cov}/{slots}).</p>
          {connected ? <button className="btn primary" disabled={pending} onClick={() => run("Market resolved", () => client.resolve(market))}>{pending ? "Waiting for wallet…" : "Resolve this market"}</button> : <p className="muted small">Connect a wallet to trigger the resolution (a small network fee applies).</p>}
        </>
      )}

      {resolved && market.resSamples === 0 && (
        <p className="notice warn"><b>No price was recorded in the final window</b> (0 of {slots} slots), so the contract voided the market. Everyone can redeem at the final market price.</p>
      )}
      {showChecks && (
        <>
          <h3>{resolved ? "Result" : "If it resolved now"}: <span className={`pill ${resolved ? (market.status === "resolvedYes" ? "yes" : market.status === "resolvedNo" ? "no" : "void") : preview?.verdict ?? ""}`}>{(resolved ? (market.status === "resolvedYes" ? "yes" : market.status === "resolvedNo" ? "no" : "void") : preview?.verdict ?? "…").toUpperCase()}</span></h3>
          <ul className="checks">
            <Check ok={covOk} label={`Enough samples (${cov}/${slots}, need 80%)`} />
            <Check ok={liq >= market.minLiquidityUsd} label={`Median pool liquidity ${usd(liq)} (market minimum ${usd(market.minLiquidityUsd)})`} />
            <Check ok={twap >= market.threshold} label={`Average market cap ${usd(twap)} vs threshold ${usd(market.threshold)}`} />
            <Check ok={cov > 0 && above * 10 >= cov * 9} label={`${cov ? pct(above / cov) : "0%"} of samples above the threshold (need 90%)`} />
          </ul>
        </>
      )}
      <p className="muted small">
        Everything above is read from <a href={explorerAddr(market.address.toBase58())} target="_blank" rel="noopener noreferrer">the market account</a>
        {" "}and its sample buffer. Price source: PumpSwap pool <span className="mono">{short(market.sourcePool.toBase58())}</span> + Pyth SOL/USD, read on-chain.
      </p>
    </section>
  );
}
