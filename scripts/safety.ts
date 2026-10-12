import { Connection } from "@solana/web3.js";

export type Network = "devnet" | "mainnet" | "localnet";
const GENESIS = { mainnet: "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d", devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" } as const;

/** The RPC must really be the network the operator asked for (NETWORK env). Throws otherwise. */
export async function assertNetwork(rpcUrl: string, expected: Network): Promise<void> {
  const g = await new Connection(rpcUrl).getGenesisHash();
  if (expected === "mainnet" && g !== GENESIS.mainnet) throw new Error("NETWORK=mainnet but the RPC is not mainnet-beta");
  if (expected === "devnet" && g !== GENESIS.devnet) throw new Error("NETWORK=devnet but the RPC is not devnet");
  if (expected === "localnet" && (g === GENESIS.mainnet || g === GENESIS.devnet)) throw new Error("NETWORK=localnet but the RPC is a public network");
}
