/**
 * DEV-ONLY wallet (Wallet Standard) for trying the app without a browser extension.
 * Active ONLY when `vite dev` AND VITE_CLUSTER=localnet. The call site is guarded by `import.meta.env.DEV`,
 * so bundlers drop this whole module from production builds. The key lives in localStorage and is worthless (local validator).
 */
import { Connection, Keypair, Transaction } from "@solana/web3.js";
import { config } from "./config";
import { requestFaucet } from "./lib/api";

const KEY = "lastcall-dev-wallet";
const NAME = "Dev Wallet (local only)";
const ICON = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#ffb020"/><path d="M9 21l5-6 4 3 6-8" stroke="#1a1204" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>');

function loadKeypair(): { kp: Keypair; fresh: boolean } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { kp: Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw))), fresh: false };
  } catch { /* fall through and create a new one */ }
  const kp = Keypair.generate();
  try { localStorage.setItem(KEY, JSON.stringify(Array.from(kp.secretKey))); } catch { /* private mode */ }
  return { kp, fresh: true };
}

export async function registerDevWallet() {
  if (!import.meta.env.DEV || config.cluster !== "localnet") return;
  const { kp, fresh } = loadKeypair();
  const conn = new Connection(config.rpcUrl, "confirmed");

  // fund with local SOL (airdrop works on a local validator) and test tokens from the local faucet
  try {
    if ((await conn.getBalance(kp.publicKey)) < 1e9) await conn.confirmTransaction(await conn.requestAirdrop(kp.publicKey, 5e9), "confirmed");
    if (fresh) await requestFaucet(kp.publicKey.toBase58()).catch(() => undefined);
  } catch (e) { console.warn("[dev-wallet] funding failed:", (e as Error).message); }

  const account = { address: kp.publicKey.toBase58(), publicKey: kp.publicKey.toBytes(), chains: ["solana:localnet", "solana:devnet"], features: ["solana:signTransaction"] };
  const wallet = {
    version: "1.0.0", name: NAME, icon: ICON, chains: account.chains, accounts: [account],
    features: {
      "standard:connect": { version: "1.0.0", connect: async () => ({ accounts: [account] }) },
      "standard:disconnect": { version: "1.0.0", disconnect: async () => undefined },
      "standard:events": { version: "1.0.0", on: () => () => undefined },
      "solana:signTransaction": {
        version: "1.0.0", supportedTransactionVersions: ["legacy", 0],
        signTransaction: async (...inputs: Array<{ transaction: Uint8Array }>) =>
          inputs.map(({ transaction }) => { const tx = Transaction.from(transaction); tx.partialSign(kp); return { signedTransaction: tx.serialize() }; }),
      },
    },
  };
  const cb = ({ register }: { register: (w: unknown) => void }) => register(wallet);
  window.dispatchEvent(new CustomEvent("wallet-standard:register-wallet", { detail: cb }));
  window.addEventListener("wallet-standard:app-ready", (e) => cb((e as CustomEvent).detail));
  try { if (!localStorage.getItem("walletName")) localStorage.setItem("walletName", JSON.stringify(NAME)); } catch { /* ignore */ }
  console.info(`[dev-wallet] ${account.address} (local validator only)`);
}
