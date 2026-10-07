import { PROGRAM_ID } from "@lifecycle-markets/sdk";
import { PublicKey } from "@solana/web3.js";

const e = import.meta.env;
const pk = (v: string | undefined) => (v ? new PublicKey(v) : undefined);

export const config = {
  rpcUrl: (e.VITE_RPC_URL as string) || "https://api.devnet.solana.com",
  cluster: ((e.VITE_CLUSTER as string) || "devnet") as "devnet" | "localnet",
  programId: pk(e.VITE_PROGRAM_ID as string) ?? PROGRAM_ID,
  collateralMint: pk(e.VITE_COLLATERAL_MINT as string),
  /** Trusted resolver key, pinned at build time (NOT taken from the API). Markets with any other resolver are hidden. */
  resolver: pk(e.VITE_RESOLVER_PUBKEY as string),
  demoAuthority: pk(e.VITE_DEMO_AUTHORITY as string),
  resolverApi: ((e.VITE_RESOLVER_API as string) || "").replace(/\/$/, ""),
  faucetApi: ((e.VITE_FAUCET_API as string) || "").replace(/\/$/, ""),
};

export const explorerTx = (sig: string) =>
  `https://explorer.solana.com/tx/${sig}?cluster=${config.cluster === "devnet" ? "devnet" : "custom&customUrl=" + encodeURIComponent(config.rpcUrl)}`;
export const explorerAddr = (a: string) =>
  `https://explorer.solana.com/address/${a}?cluster=${config.cluster === "devnet" ? "devnet" : "custom&customUrl=" + encodeURIComponent(config.rpcUrl)}`;
