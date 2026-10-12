import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { NetworkSelect } from "./NetworkSelect";
import { config } from "../config";
import { useCollateralBalance } from "../hooks/queries";
import { requestFaucet } from "../lib/api";
import { formatUnits } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { useToast } from "./Toasts";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export function Header() {
  const { publicKey } = useWallet();
  const balance = useCollateralBalance(publicKey).data;
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const faucet = async () => {
    if (!publicKey) return;
    setBusy(true);
    try { await requestFaucet(publicKey.toBase58()); toast.success("Test tokens sent"); await qc.invalidateQueries({ queryKey: ["balance"] }); }
    catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <>
      {config.real && <div className="banner real" role="alert"><b>MAINNET</b> · real funds · unaudited software</div>}
      <header className="header">
        <Link to="/" className="brand"><Logo size={32} /> <span className="wordmark">Last <b>Call</b></span></Link>
        <nav>
          <NavLink to="/" end>Markets</NavLink>
          <NavLink to="/create">Create</NavLink>
        </nav>
        <div className="grow" />
        <NetworkSelect />
        {publicKey && (
          <div className="bal" title="Test token balance">
            {balance === undefined ? "…" : formatUnits(balance, 2)} <small>test</small>
            {config.faucetApi && <button className="btn ghost sm" onClick={faucet} disabled={busy}>{busy ? "…" : "Get test tokens"}</button>}
          </div>
        )}
        <WalletMultiButton />
      </header>
    </>
  );
}
