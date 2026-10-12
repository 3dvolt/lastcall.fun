import { PROGRAM_ERROR_NAMES, PROGRAM_ERRORS } from "@lifecycle-markets/sdk";

/** Friendlier wording for the errors people actually hit; everything else uses the program's own message. */
const FRIENDLY: Record<string, string> = {
  SlippageExceeded: "The price moved more than your slippage tolerance. Try again or raise slippage.",
  TradingClosed: "Trading is closed: the market has expired.",
  NotExpired: "The market has not expired yet.",
  OutsideWindow: "Prices can only be recorded during the final window of the market.",
  SlotAlreadyFilled: "This time slot already has a recorded price. Try again in a few seconds.",
  StaleFeed: "The price data is too old right now. Try again in a moment.",
  NotStandalone: "A price sample must be sent as its own transaction.",
};
/** Turns wallet / RPC / program errors into one short sentence a person can act on. */
export function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/user rejected|rejected the request|declined|cancell?ed/i.test(msg)) return "You cancelled the request in your wallet.";
  const hex = msg.match(/custom program error: 0x([0-9a-f]+)/i);
  const dec = msg.match(/"Custom":\s*(\d+)/);
  const code = hex ? parseInt(hex[1], 16) : dec ? Number(dec[1]) : undefined;
  if (code !== undefined && PROGRAM_ERRORS[code]) {
    const raw = PROGRAM_ERRORS[code];
    return FRIENDLY[PROGRAM_ERROR_NAMES[code]] ?? raw;
  }
  if (/insufficient funds|0x1\b/i.test(msg) && /token/i.test(msg)) return "Not enough tokens for this transaction.";
  if (/attempt to debit an account but found no record of a prior credit/i.test(msg)) return "Your wallet has no SOL on this network. Add SOL for fees.";
  if (/blockhash not found|expired/i.test(msg)) return "The transaction expired. Please try again.";
  if (/failed to fetch|network|timeout/i.test(msg)) return "Network problem. Check your connection and try again.";
  return msg.length > 160 ? msg.slice(0, 157) + "…" : msg;
}
