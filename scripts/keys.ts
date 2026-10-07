/** Generates the (gitignored) keypair files needed for the demo, if missing. Prints public keys only. */
import { Keypair } from "@solana/web3.js";
import { copyFileSync, existsSync } from "node:fs";
import { keysDir, readKeypair, writeKeypair } from "./common.js";

const roles = ["deployer", "resolver", "demo-authority", "faucet", "collateral-mint"];
for (const r of roles) {
  const path = `${keysDir()}/${r}.json`;
  if (!existsSync(path)) writeKeypair(path, Keypair.generate());
  console.log(`${r.padEnd(16)} ${readKeypair(path).publicKey.toBase58()}   (${path})`);
}
const prog = `${keysDir()}/program.json`;
if (!existsSync(prog)) {
  if (existsSync("target/deploy/lifecycle_markets-keypair.json")) copyFileSync("target/deploy/lifecycle_markets-keypair.json", prog);
  else console.log("program          (run `anchor build` first, then re-run to copy target/deploy/lifecycle_markets-keypair.json)");
}
if (existsSync(prog)) console.log(`${"program".padEnd(16)} ${readKeypair(prog).publicKey.toBase58()}   (${prog})`);
console.log("\nSet DEMO_AUTHORITY in .env to the demo-authority public key above.");
