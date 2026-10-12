/** `npm run preflight`: checks everything needed before going live on devnet and says exactly what is missing. */
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { existsSync } from "node:fs";
import { connect, keysDir, loadDeployment, programId, readKeypair } from "./common.js";

const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => { console.log(`  ✗ ${m}`); problems++; };
let problems = 0;

const { conn, cluster } = await connect();
console.log(`cluster: ${cluster}  rpc: ${new URL(process.env.RPC_URL!).host}`);
if (cluster === "devnet" && /api\.devnet\.solana\.com/.test(process.env.RPC_URL!)) bad("using the public RPC (rate limited). Get a free key from Alchemy/Helius/QuickNode and set RPC_URL");
else ok("RPC endpoint");

console.log("keys & balances (SOL needed: deployer 4 [peak, ~1.9 net], demo-authority 1, keeper 0.3, faucet 0.5)");
const need: Record<string, number> = { deployer: 4, "demo-authority": 1, keeper: 0.3, faucet: 0.5 };
for (const [role, min] of Object.entries(need)) {
  const path = `${keysDir()}/${role}.json`;
  if (!existsSync(path)) { bad(`${path} missing: run npm run keys`); continue; }
  const kp = readKeypair(path);
  const bal = (await conn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL;
  (bal >= min ? ok : bad)(`${role.padEnd(15)} ${kp.publicKey.toBase58()}  ${bal.toFixed(2)} SOL${bal >= min ? "" : `  (needs ≥ ${min})`}`);
}

console.log("program");
if (!existsSync("target/deploy-prod/lifecycle_markets.so")) bad("not built: run bash scripts/build.sh prod");
else ok("target/deploy-prod/lifecycle_markets.so built");
const info = await conn.getAccountInfo(programId());
(info?.executable ? ok : bad)(info?.executable ? `deployed at ${programId().toBase58()}` : `not deployed yet at ${programId().toBase58()}: run npm run deploy:devnet`);

console.log("deployment");
const dep = loadDeployment(cluster);
(dep.collateralMint ? ok : bad)(dep.collateralMint ? `collateral mint ${dep.collateralMint}` : "no collateral mint: run npm run create-collateral");
(dep.markets.length ? ok : bad)(dep.markets.length ? `${dep.markets.length} markets seeded` : "no markets: run npm run seed");


console.log(problems ? `\n${problems} thing(s) to fix before going live.` : "\nAll good. Ready to go live.");
process.exit(problems ? 1 : 0);
