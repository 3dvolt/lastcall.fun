import { config as loadEnv } from "dotenv";
import { Keypair, PublicKey } from "@solana/web3.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_PARAMS, type EvalParams } from "./types.js";

export interface Config {
  rpcUrl: string;
  programId?: PublicKey;
  resolverKeypair: Keypair;
  demoAuthority: PublicKey;
  port: number;
  dataDir: string;
  params: EvalParams;
  windowOverrideSecs?: number;
  /** if set, only markets created by these pubkeys are sampled/resolved (anti-griefing) */
  allowedCreators?: PublicKey[];
}

export const loadKeypair = (path: string): Keypair =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(resolve(path), "utf8"))));

export function loadConfig(): Config {
  loadEnv({ path: process.env.ENV_FILE ?? ".env", quiet: true });
  const e = process.env;
  const need = (k: string) => { const v = e[k]; if (!v) throw new Error(`missing env ${k} (see .env.example)`); return v; };
  const params: EvalParams = {
    ...DEFAULT_PARAMS,
    minLiquidityUsd: e.MIN_LIQUIDITY_USD ? BigInt(e.MIN_LIQUIDITY_USD) * 1_000_000n : DEFAULT_PARAMS.minLiquidityUsd,
    sampleIntervalSecs: e.SAMPLE_INTERVAL_SECS ? Number(e.SAMPLE_INTERVAL_SECS) : DEFAULT_PARAMS.sampleIntervalSecs,
    maxStalenessSecs: e.MAX_STALENESS_SECS ? Number(e.MAX_STALENESS_SECS) : DEFAULT_PARAMS.maxStalenessSecs,
  };
  return {
    rpcUrl: need("RPC_URL"),
    programId: e.PROGRAM_ID ? new PublicKey(e.PROGRAM_ID) : undefined,
    resolverKeypair: loadKeypair(e.RESOLVER_KEYPAIR ?? `${e.KEYS_DIR ?? "keys"}/resolver.json`),
    demoAuthority: new PublicKey(need("DEMO_AUTHORITY")),
    port: Number(e.PORT ?? 8787),
    dataDir: e.DATA_DIR ?? "data",
    params,
    allowedCreators: e.ALLOWED_CREATORS ? e.ALLOWED_CREATORS.split(",").map((x) => new PublicKey(x.trim())) : undefined,
    windowOverrideSecs: e.WINDOW_SECS ? Number(e.WINDOW_SECS) : undefined,
  };
}
