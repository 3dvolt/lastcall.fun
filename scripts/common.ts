import { AnchorProvider, Wallet } from "@anchor-lang/core";
import { LifecycleClient, PROGRAM_ID } from "@lifecycle-markets/sdk";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { config as loadEnv } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { assertDevnetOrLocal } from "../resolver/src/safety.js";

loadEnv({ path: process.env.ENV_FILE ?? ".env", quiet: true });

export const env = (k: string, d?: string): string => {
  const v = process.env[k] ?? d;
  if (v === undefined || v === "") throw new Error(`missing env ${k} (see .env.example)`);
  return v;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const readKeypair = (path: string): Keypair => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(path), "utf8"))));
export function writeKeypair(path: string, kp: Keypair) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(resolve(path), JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 });
}
export const keysDir = (): string => process.env.KEYS_DIR ?? "keys";
export const loadRole = (name: "DEPLOYER" | "RESOLVER" | "DEMO_AUTHORITY" | "FAUCET"): Keypair =>
  readKeypair(process.env[`${name}_KEYPAIR`] ?? `${keysDir()}/${name.toLowerCase().replace("_", "-")}.json`);

export async function connect(): Promise<{ conn: Connection; cluster: "devnet" | "localnet" }> {
  const url = env("RPC_URL");
  const cluster = await assertDevnetOrLocal(url); // refuses mainnet
  return { conn: new Connection(url, "confirmed"), cluster };
}

export const programId = (): PublicKey => (process.env.PROGRAM_ID ? new PublicKey(process.env.PROGRAM_ID) : PROGRAM_ID);

export function clientFor(conn: Connection, kp: Keypair): LifecycleClient {
  return new LifecycleClient(new AnchorProvider(conn, new Wallet(kp), { commitment: "confirmed" }), programId());
}

export async function ensureSol(conn: Connection, kp: Keypair, minSol: number) {
  const bal = await conn.getBalance(kp.publicKey);
  if (bal >= minSol * LAMPORTS_PER_SOL) return;
  try {
    const sig = await conn.requestAirdrop(kp.publicKey, Math.ceil(minSol * LAMPORTS_PER_SOL) - bal);
    await conn.confirmTransaction(sig, "confirmed");
  } catch (e) {
    throw new Error(`Could not airdrop to ${kp.publicKey.toBase58()} (${(e as Error).message}). Devnet faucets are rate limited: use https://faucet.solana.com and retry.`);
  }
}

// ---- deployments file (public keys only; safe to commit) ----
export interface Deployment {
  cluster: string;
  programId: string;
  collateralMint?: string;
  resolver?: string;
  demoAuthority?: string;
  faucet?: string;
  markets: Array<{ id: string; marketId: string; market: string; tokenRef: string; label: string; scenario?: string; expiryTs: number; threshold: string }>;
}
export const deploymentPath = (cluster: string) => resolve(`deployments/${cluster}.json`);
export function loadDeployment(cluster: string): Deployment {
  const p = deploymentPath(cluster);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : { cluster, programId: programId().toBase58(), markets: [] };
}
export function saveDeployment(d: Deployment) {
  mkdirSync(dirname(deploymentPath(d.cluster)), { recursive: true });
  writeFileSync(deploymentPath(d.cluster), JSON.stringify(d, null, 2) + "\n");
}

export const usd = (n: number): bigint => BigInt(Math.round(n * 1e6));
export const fmt6 = (n: bigint): string => (Number(n) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 6 });
