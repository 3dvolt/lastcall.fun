import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Link, NavLink } from "react-router-dom";
import { Logo } from "./Logo";
import { NetworkSelect } from "./NetworkSelect";
import { config } from "../config";
import { useCollateralBalance } from "../hooks/queries";
import { formatUnits } from "../lib/format";

export function Header() {
  const { publicKey } = useWallet();
  const balance = useCollateralBalance(publicKey).data;

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
          <div className="bal" title="Collateral balance">
            {balance === undefined ? "…" : formatUnits(balance, 2)}
          </div>
        )}
        <WalletMultiButton />
      </header>
    </>
  );
}
