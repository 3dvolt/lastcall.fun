import { Connection } from "@solana/web3.js";
import { config } from "../config";

const GENESIS = {
  mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d",
  devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG",
} as const;

/** Static checks of the active network's configuration. Throws with a human message. */
export function assertSafeConfig() {
  if (!config.rpcUrl) throw new Error(`No RPC configured for ${config.label}.`);
  const u = new URL(config.rpcUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (config.id === "devnet" && !local && !/devnet/i.test(u.hostname)) throw new Error(`Devnet is selected but the RPC host (${u.hostname}) does not look like devnet.`);
  if (config.id !== "mainnet" && /mainnet/i.test(config.rpcUrl)) throw new Error("A mainnet RPC is configured for a non-mainnet network.");
  if (config.id === "mainnet" && /devnet|testnet/i.test(config.rpcUrl)) throw new Error("Mainnet is selected but the RPC looks like devnet/testnet.");
  if (config.id === "mainnet" && local) throw new Error("Mainnet cannot use a local RPC.");
  if (!config.collateralMint) throw new Error(`Collateral mint is not configured for ${config.label}.`);
}

/** The RPC must really belong to the selected network (genesis hash), so a wrong URL can never move funds on another chain. */
export async function assertNetworkMatches(conn: Connection) {
  const g = await conn.getGenesisHash();
  if (config.id === "mainnet" && g !== GENESIS.mainnet) throw new Error("The RPC is not Solana mainnet-beta. Refusing to continue.");
  if (config.id === "devnet" && g !== GENESIS.devnet) throw new Error("The RPC is not Solana devnet. Refusing to continue.");
  if (config.id === "localnet" && (g === GENESIS.mainnet || g === GENESIS.devnet)) throw new Error("Localnet is selected but the RPC is a public network.");
}
