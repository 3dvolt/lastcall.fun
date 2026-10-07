import { Connection } from "@solana/web3.js";
import { config } from "../config";

const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

/** Config must point at devnet/localhost, and the RPC must not report mainnet. Throws otherwise. */
export function assertSafeConfig() {
  const u = new URL(config.rpcUrl);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!local && !u.hostname.includes("devnet")) throw new Error(`Refusing RPC ${u.hostname}: devnet or localhost only.`);
  if (/mainnet/i.test(config.rpcUrl)) throw new Error("Refusing a mainnet RPC URL.");
  if (!config.collateralMint) throw new Error("VITE_COLLATERAL_MINT is not set (see web/.env.example).");
}

export async function assertNotMainnet(conn: Connection) {
  if ((await conn.getGenesisHash()) === MAINNET_GENESIS) throw new Error("RPC reports mainnet-beta. This app is devnet only.");
}
