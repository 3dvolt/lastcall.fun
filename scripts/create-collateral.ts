/** Creates the test collateral mint (6 decimals). Mint authority = faucet keypair. Idempotent. */
import { createMint } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { connect, ensureSol, keysDir, loadDeployment, loadRole, readKeypair, saveDeployment } from "./common.js";

const { conn, cluster } = await connect();
const faucet = loadRole("FAUCET");
const mintKp: Keypair = readKeypair(`${keysDir()}/collateral-mint.json`);
const dep = loadDeployment(cluster);
if (dep.collateralMint && (await conn.getAccountInfo(mintKp.publicKey))) {
  console.log(`collateral mint already exists: ${dep.collateralMint}`);
} else {
  await ensureSol(conn, faucet, 1);
  await createMint(conn, faucet, faucet.publicKey, null, 6, mintKp);
  dep.collateralMint = mintKp.publicKey.toBase58();
  console.log(`created collateral mint ${dep.collateralMint} (6 decimals, mint authority ${faucet.publicKey.toBase58()})`);
}
dep.faucet = faucet.publicKey.toBase58();
saveDeployment(dep);
