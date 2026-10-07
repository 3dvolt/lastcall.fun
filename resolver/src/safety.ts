import { Connection } from "@solana/web3.js";

/** Mainnet-beta genesis hash. We refuse to run against it. */
const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

/** DEVNET / localhost only. Throws for anything else (checked by URL and by genesis hash). */
export async function assertDevnetOrLocal(rpcUrl: string): Promise<"devnet" | "localnet"> {
  const u = new URL(rpcUrl);
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname);
  const devnet = u.hostname.includes("devnet");
  if (!local && !devnet) throw new Error(`Refusing RPC ${u.hostname}: only devnet or localhost are allowed`);
  if (/mainnet/i.test(rpcUrl)) throw new Error("Refusing a mainnet RPC URL");
  const genesis = await new Connection(rpcUrl).getGenesisHash();
  if (genesis === MAINNET_GENESIS) throw new Error("RPC reports mainnet-beta genesis hash. Refusing.");
  return local ? "localnet" : "devnet";
}
