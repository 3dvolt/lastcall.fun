import { voidPayout, type MarketAccount, type PositionAccount } from "@lifecycle-markets/sdk";
import type { PublicKey } from "@solana/web3.js";
import { useState } from "react";
import { useClient } from "../lib/client";
import { useTx } from "../hooks/useTx";
import { formatUnits } from "../lib/format";
import { ConfirmModal } from "./ConfirmModal";

/** Payout the program will make for this position (mirrors redeem.rs). */
export function redeemable(m: MarketAccount, p: PositionAccount): bigint {
  if (m.status === "resolvedYes") return p.yesShares;
  if (m.status === "resolvedNo") return p.noShares;
  if (m.status === "void") return voidPayout(p.yesShares, p.noShares, m.voidYesPrice, m.voidNoPrice);
  return 0n;
}

export function PositionPanel({ market, position, wallet }: { market: MarketAccount; position: PositionAccount | null | undefined; wallet: PublicKey | null }) {
  const { client } = useClient();
  const { run, pending } = useTx();
  const [dlg, setDlg] = useState<"redeem" | "claim" | null>(null);
  if (!wallet) return null;
  const isCreator = market.creator.equals(wallet);
  const resolved = market.status !== "open";
  const payout = position && resolved ? redeemable(market, position) : 0n;
  const residual = market.totalMinted + market.feesAccrued - market.userObligation;
  const canRedeem = resolved && !!position && !position.redeemed;
  const canClaim = resolved && isCreator && !market.residualClaimed;
  if (!position && !canClaim) return null;

  return (
    <section className="card">
      <h2>Your position</h2>
      {position ? (
        <dl className="rows">
          <div className="row"><dt>YES shares</dt><dd>{formatUnits(position.yesShares, 4)}</dd></div>
          <div className="row"><dt>NO shares</dt><dd>{formatUnits(position.noShares, 4)}</dd></div>
          {resolved && <div className="row strong"><dt>{position.redeemed ? "Redeemed" : "You can redeem"}</dt><dd>{formatUnits(payout, 4)} tokens</dd></div>}
        </dl>
      ) : <p className="muted">You have no shares in this market.</p>}
      {market.status === "void" && position && !position.redeemed && <p className="notice">This market is void. Shares pay the final market price, not what you originally paid.</p>}
      {canRedeem && <button className="btn primary block" onClick={() => setDlg("redeem")}>Redeem {formatUnits(payout, 2)} tokens</button>}
      {canClaim && (<><p className="muted small">You created this market: the pool's remaining value ({formatUnits(residual, 2)} tokens, including fees) is yours.</p>
        <button className="btn block" onClick={() => setDlg("claim")}>Claim {formatUnits(residual, 2)} tokens</button></>)}
      {dlg === "redeem" && (
        <ConfirmModal title="Redeem winnings" confirmLabel="Confirm in wallet" pending={pending} onCancel={() => setDlg(null)}
          rows={[{ k: "You receive", v: `${formatUnits(payout, 6)} tokens`, strong: true }]}
          onConfirm={async () => { if (await run("Redeem", () => client.redeem(market))) setDlg(null); }} />
      )}
      {dlg === "claim" && (
        <ConfirmModal title="Claim residual" confirmLabel="Confirm in wallet" pending={pending} onCancel={() => setDlg(null)}
          rows={[{ k: "You receive", v: `${formatUnits(residual, 6)} tokens`, strong: true }]}
          onConfirm={async () => { if (await run("Claim", () => client.claimResidual(market))) setDlg(null); }} />
      )}
    </section>
  );
}
