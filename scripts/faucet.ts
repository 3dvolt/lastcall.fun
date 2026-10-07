/** CLI faucet: npm run faucet -- <wallet> [amountTokens=1000]. Mints TEST collateral to the wallet's ATA. */
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { connect, ensureSol, loadDeployment, loadRole } from "./common.js";

const [walletArg, amountArg = "1000"] = process.argv.slice(2);
if (!walletArg) { console.error("usage: npm run faucet -- <wallet> [amountTokens]"); process.exit(1); }
const { conn, cluster } = await connect();
const dep = loadDeployment(cluster);
if (!dep.collateralMint) throw new Error("run `npm run create-collateral` first");
const faucet = loadRole("FAUCET");
await ensureSol(conn, faucet, 0.1);
const mint = new PublicKey(dep.collateralMint);
const ata = await getOrCreateAssociatedTokenAccount(conn, faucet, mint, new PublicKey(walletArg));
const amount = BigInt(Math.round(Number(amountArg) * 1e6));
const sig = await mintTo(conn, faucet, mint, ata.address, faucet, amount);
console.log(`minted ${amountArg} test tokens to ${walletArg} (ata ${ata.address.toBase58()}) tx ${sig}`);
