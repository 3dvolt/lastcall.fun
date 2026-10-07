/**
 * Tiny HTTP faucet for the frontend: POST /faucet {"wallet": "<pubkey>"}  ->  mints FAUCET_MAX_TOKENS TEST tokens.
 * Rate limited to one claim per wallet per hour (in memory). Devnet test token only. This is the only writing HTTP endpoint
 * and it is a separate process from the read-only resolver API.
 */
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import express from "express";
import { connect, env, ensureSol, loadDeployment, loadRole } from "./common.js";

const { conn, cluster } = await connect();
const dep = loadDeployment(cluster);
if (!dep.collateralMint) throw new Error("run `npm run create-collateral` first");
const mint = new PublicKey(dep.collateralMint);
const faucet = loadRole("FAUCET");
await ensureSol(conn, faucet, 0.5);
const amount = BigInt(Math.round(Number(env("FAUCET_MAX_TOKENS", "1000")) * 1e6));
const lastClaim = new Map<string, number>();
const ipClaims = new Map<string, number[]>();
const MAX_PER_IP_PER_HOUR = 3, MAX_GLOBAL_PER_HOUR = 60;
let globalClaims: number[] = [];

const app = express();
app.use(express.json({ limit: "1kb" }));
app.use((_req, res, next) => { res.setHeader("Access-Control-Allow-Origin", "*"); res.setHeader("Access-Control-Allow-Headers", "content-type"); next(); });
app.options("/faucet", (_req, res) => { res.sendStatus(204); });
app.get("/health", (_req, res) => { res.json({ ok: true, mint: mint.toBase58(), cluster, amount: amount.toString() }); });
app.post("/faucet", async (req, res) => {
  try {
    const wallet = new PublicKey(String(req.body?.wallet));
    const now = Date.now();
    const ip = req.ip ?? "?";
    const recent = (ipClaims.get(ip) ?? []).filter((t) => t > now - 3_600_000);
    globalClaims = globalClaims.filter((t) => t > now - 3_600_000);
    if (recent.length >= MAX_PER_IP_PER_HOUR || globalClaims.length >= MAX_GLOBAL_PER_HOUR) { res.status(429).json({ error: "faucet limit reached, try later" }); return; }
    recent.push(now); ipClaims.set(ip, recent); globalClaims.push(now);
    if ((lastClaim.get(wallet.toBase58()) ?? 0) > now - 3_600_000) { res.status(429).json({ error: "one claim per hour per wallet" }); return; }
    lastClaim.set(wallet.toBase58(), now);
    const ata = await getOrCreateAssociatedTokenAccount(conn, faucet, mint, wallet);
    const signature = await mintTo(conn, faucet, mint, ata.address, faucet, amount);
    res.json({ signature, mint: mint.toBase58(), ata: ata.address.toBase58(), amount: amount.toString() });
  } catch (e) { res.status(400).json({ error: (e as Error).message }); }
});
const port = Number(env("FAUCET_PORT", "8788"));
app.listen(port, () => console.log(`[faucet] :${port} cluster=${cluster} mint=${mint.toBase58()}`));
