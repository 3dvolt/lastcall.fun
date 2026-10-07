const PROGRAM_ERRORS: Record<number, string> = {
  6000: "Calculation overflow.",
  6001: "Amount must be greater than zero.",
  6002: "That would push the pool beyond its supported size.",
  6003: "The pool does not have enough depth for this trade.",
  6004: "Pool safety check failed.",
  6005: "The price moved more than your slippage tolerance. Try again or raise slippage.",
  6006: "This market is no longer open.",
  6007: "Trading is closed: the market has expired.",
  6008: "The market has not expired yet.",
  6009: "The market is not resolved yet.",
  6010: "Only the market's resolver can do that.",
  6011: "Only the market creator can do that.",
  6012: "Only the feed authority can do that.",
  6013: "Expiry must be in the future.",
  6014: "One of the parameters is invalid.",
  6015: "Fee is too high (max 10%).",
  6016: "This position was already redeemed.",
  6017: "The residual was already claimed.",
  6018: "You do not have enough shares.",
  6019: "Account mismatch.",
};

/** Turns wallet / RPC / program errors into one short sentence a person can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|rejected the request|declined|cancell?ed/i.test(msg)) return "You cancelled the request in your wallet.";
  const hex = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  const dec = msg.match(/"Custom":\s*(\d+)/);
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : undefined;
  if (code !== undefined && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];
  if (/insufficient funds|0x1\b/i.test(msg) && /token/i.test(msg)) return "Not enough test tokens. Use the faucet.";
  if (/attempt to debit an account but found no record of a prior credit/i.test(msg)) return "Your wallet has no SOL on this network. Get devnet SOL for fees.";
  if (/blockhash not found|expired/i.test(msg)) return "The transaction expired. Please try again.";
  if (/failed to fetch|network|timeout/i.test(msg)) return "Network problem. Check your connection and try again.";
  return msg.length > 160 ? msg.slice(0, 157) + "…" : msg;
}
