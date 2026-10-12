import { PROGRAM_ID } from "@lifecycle-markets/sdk";
import { PublicKey } from "@solana/web3.js";

export type NetworkId = "devnet" | "mainnet" | "localnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  /** real money. Mainnet only. */
  real: boolean;
  /** all the values needed to operate on this network are present */
  configured: boolean;
  rpcUrl: string;
  /** RPC used ONLY for getProgramAccounts (free plans of some providers disable it); the public Solana RPC allows it */
  listRpcUrl?: string;
  programId: PublicKey;
  collateralMint?: PublicKey;
  /** test-only: also show markets that use the demo price feed (never on mainnet) */
  allowDemoFeed: boolean;
  faucetApi: string;
}

const e = import.meta.env as Record<string, string | undefined>;
const pk = (v: string | undefined) => (v ? new PublicKey(v) : undefined);
const url = (v: string | undefined) => (v ?? "").replace(/\/$/, "");

// The base network (devnet, or localnet in development) uses the plain VITE_* variables.
const baseId: NetworkId = e.VITE_CLUSTER === "localnet" ? "localnet" : "devnet";
const base: NetworkConfig = {
  id: baseId,
  label: baseId === "devnet" ? "Devnet" : "Localnet",
  real: false,
  rpcUrl: e.VITE_RPC_URL || "https://api.devnet.solana.com",
  listRpcUrl: e.VITE_LIST_RPC_URL || (baseId === "devnet" ? "https://api.devnet.solana.com" : undefined),
  programId: pk(e.VITE_PROGRAM_ID) ?? PROGRAM_ID,
  collateralMint: pk(e.VITE_COLLATERAL_MINT),
  allowDemoFeed: baseId !== "devnet" || e.VITE_ALLOW_DEMO_FEED === "1",
  faucetApi: url(e.VITE_FAUCET_API),
  configured: !!e.VITE_COLLATERAL_MINT,
};

// Mainnet is listed in the selector but stays disabled until ALL of its own variables are set.
const mainnet: NetworkConfig = {
  id: "mainnet",
  label: "Mainnet",
  real: true,
  rpcUrl: e.VITE_MAINNET_RPC_URL ?? "",
  listRpcUrl: e.VITE_MAINNET_LIST_RPC_URL || "https://api.mainnet-beta.solana.com",
  programId: pk(e.VITE_MAINNET_PROGRAM_ID) ?? PROGRAM_ID,
  collateralMint: pk(e.VITE_MAINNET_COLLATERAL_MINT),
  allowDemoFeed: false, // the test price source is never trusted on mainnet
  faucetApi: "", // never a faucet on mainnet
  configured: !!(e.VITE_MAINNET_RPC_URL && e.VITE_MAINNET_PROGRAM_ID && e.VITE_MAINNET_COLLATERAL_MINT),
};

export const networks: NetworkConfig[] = [base, mainnet];
const STORAGE_KEY = "lastcall-network";

function selected(): NetworkConfig {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    const n = networks.find((x) => x.id === id);
    if (n && n.configured) return n;
  } catch { /* storage unavailable: use default */ }
  return base;
}

/** The active network, fixed for the lifetime of the page; switching reloads the app. */
export const config = (() => {
  const n = selected();
  return { ...n, network: n.id, cluster: n.id };
})();

export function switchNetwork(id: NetworkId) {
  try { localStorage.setItem(STORAGE_KEY, id); } catch { /* ignore */ }
  window.location.reload();
}

const clusterParam = () =>
  config.id === "mainnet" ? "" : config.id === "devnet" ? "?cluster=devnet" : `?cluster=custom&customUrl=${encodeURIComponent(config.rpcUrl)}`;
export const explorerTx = (sig: string) => `https://explorer.solana.com/tx/${sig}${clusterParam()}`;
export const explorerAddr = (a: string) => `https://explorer.solana.com/address/${a}${clusterParam()}`;
