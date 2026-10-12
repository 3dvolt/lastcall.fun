import { Connection, TransactionExpiredBlockheightExceededError, type Commitment } from "@solana/web3.js";

/**
 * fetch with a hard timeout. A request on a stale keep-alive socket can otherwise hang forever without an error,
 * which would freeze a keeper or a script. With the timeout it fails fast and callers can retry.
 */
export const timeoutFetch = (ms = 15_000) =>
  ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, { ...init, signal: AbortSignal.timeout(ms) })) as typeof fetch;

/**
 * A Connection with timeouts, and with confirmation done by POLLING signature statuses instead of a WebSocket subscription:
 * several RPC providers (e.g. Alchemy) do not support `signatureSubscribe`, which makes web3.js / spl-token helpers hang.
 */
export const makeConnection = (url: string, commitment: Commitment = "confirmed", timeoutMs = 15_000): Connection => {
  const conn = new Connection(url, { commitment, fetch: timeoutFetch(timeoutMs) });
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (conn as any).confirmTransaction = async (strategy: any) => {
    const signature: string = typeof strategy === "string" ? strategy : strategy.signature;
    const lastValid: number | undefined = typeof strategy === "object" ? strategy.lastValidBlockHeight : undefined;
    for (;;) {
      const st = await conn.getSignatureStatuses([signature]).then((r) => r.value[0]).catch(() => null);
      if (st?.err) return { context: { slot: st.slot }, value: { err: st.err } };
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return { context: { slot: st.slot }, value: { err: null } };
      if (lastValid !== undefined && (await conn.getBlockHeight("confirmed").catch(() => 0)) > lastValid) throw new TransactionExpiredBlockheightExceededError(signature);
      await sleep(500);
    }
  };
  return conn;
};
