import { AnchorProvider } from "@anchor-lang/core";
import { LifecycleClient } from "@lifecycle-markets/sdk";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { Connection, Keypair } from "@solana/web3.js";
import { useMemo } from "react";
import { config } from "../config";

/** A wallet that can read but never sign: used when nobody is connected. */
const readOnlyWallet = {
  publicKey: Keypair.generate().publicKey,
  signTransaction: async () => { throw new Error("Connect a wallet first."); },
  signAllTransactions: async () => { throw new Error("Connect a wallet first."); },
};

/** SDK client bound to the connected wallet (or read-only). The wallet adapter does all signing; keys never reach this app. */
export function useClient(): { client: LifecycleClient; connected: boolean } {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  return useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const provider = new AnchorProvider(connection, (wallet ?? readOnlyWallet) as any, { commitment: "confirmed" });
    const listConn = config.listRpcUrl && config.listRpcUrl !== config.rpcUrl ? new Connection(config.listRpcUrl, "confirmed") : undefined;
    return { client: new LifecycleClient(provider, config.programId, listConn), connected: !!wallet };
  }, [connection, wallet]);
}
