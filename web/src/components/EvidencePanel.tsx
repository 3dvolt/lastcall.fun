import { useQuery } from "@tanstack/react-query";
import type { MarketAccount } from "@lifecycle-markets/sdk";
import { config, explorerAddr, explorerTx } from "../config";
import { useEvidence, useFeed } from "../hooks/queries";
import { evidenceHashHex } from "../lib/canonical";
import { usd, pct, short } from "../lib/format";

const Check = ({ ok, label }: { ok: boolean; label: string }) => (<li className={ok ? "ok" : "bad"}><span aria-hidden>{ok ? "✓" : "✗"}</span> {label}</li>);

/** Shows WHY the market resolved as it did, and independently re-derives the evidence hash committed on-chain. */
export function EvidencePanel({ market }: { market: MarketAccount }) {
  const resolved = market.status !== "open";
  const { data: ev, isLoading } = useEvidence(market.address.toBase58(), resolved);
  const feed = useFeed(market.tokenRef).data;
  const verify = useQuery({
    queryKey: ["verify", ev?.hash, market.evidenceHash],
    enabled: !!ev,
    queryFn: async () => {
      const recomputed = await evidenceHashHex(ev as unknown as Record<string, unknown>);
      return { recomputed, matchesEvidence: recomputed === ev!.hash, matchesChain: recomputed === market.evidenceHash };
    },
  });

  const feedWarn = feed && config.demoAuthority && !feed.authority.equals(config.demoAuthority);
  return (
    <section className="card">
      <h2>How it resolves</h2>
      <p className="muted">A token only counts as <b>YES</b> if its market cap stays above the threshold for the whole final window, not just for a few seconds.</p>
      <ol className="rules">
        <li><b>Void</b> if liquidity is too thin or too many price samples are missing.</li>
        <li><b>Yes</b> only if the average (TWAP) is above the threshold <i>and</i> at least 90% of samples are.</li>
        <li><b>No</b> otherwise.</li>
      </ol>
      {feedWarn && <p className="notice warn">Price feed for this token was written by an unexpected authority. Treat this market with caution.</p>}
      {!resolved && <p className="notice">Not resolved yet. The evidence will appear here after expiry.</p>}
      {resolved && isLoading && <p className="muted">Loading evidence…</p>}
      {resolved && !isLoading && !ev && <p className="notice warn">Resolved on-chain, but the resolver API has no evidence for this market.</p>}
      {ev && (
        <>
          <h3>Result: <span className={`pill ${ev.outcome}`}>{ev.outcome.toUpperCase()}</span></h3>
          <ul className="checks">
            <Check ok={ev.rules.coverageOk} label={`Enough samples (${ev.samples.count}/${ev.samples.expected}, need ${pct(ev.parameters.minCoverage)})`} />
            <Check ok={ev.rules.liquidityOk} label={`Median liquidity ${usd(BigInt(ev.samples.liquidity.median))} (min ${usd(BigInt(ev.parameters.minLiquidityUsd))})`} />
            <Check ok={ev.rules.twapAtLeastThreshold} label={`Average market cap ${usd(BigInt(ev.samples.marketCap.twap))} vs threshold ${usd(BigInt(ev.threshold))}`} />
            <Check ok={ev.rules.sustainedAtLeastMinFraction} label={`${pct(ev.samples.aboveThresholdFraction)} of samples above threshold (need ${pct(ev.parameters.minSustainedFraction)}). Peak ${usd(BigInt(ev.samples.marketCap.max))}`} />
          </ul>
          <div className="verify">
            <b>Independent check</b>
            {verify.isLoading && <span className="muted"> computing…</span>}
            {verify.data && (verify.data.matchesChain && verify.data.matchesEvidence
              ? <p className="ok">✓ The hash of this evidence, computed in your browser, matches the one the resolver committed on-chain.</p>
              : <p className="bad">✗ Hash mismatch. This evidence does not match what was committed on-chain.</p>)}
            <p className="mono small">on-chain: {short(market.evidenceHash, 10)}</p>
            <p className="small">
              <a href={explorerAddr(market.address.toBase58())} target="_blank" rel="noopener noreferrer">Market account</a>
              {ev.txSignature && <> · <a href={explorerTx(ev.txSignature)} target="_blank" rel="noopener noreferrer">Resolution transaction</a></>}
            </p>
          </div>
        </>
      )}
      <p className="muted small">Trust note: the resolver is a single key and the price feed is a demo feed. Only the evidence hash is committed on-chain.</p>
    </section>
  );
}
