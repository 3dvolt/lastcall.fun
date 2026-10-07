/**
 * End-to-end SDK test against a local solana-test-validator (spawned here, ports 8999/9900).
 * Requires `anchor build` first. Skipped if solana-test-validator is not on PATH.
 */
import { AnchorProvider, Wallet } from "@anchor-lang/core";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from "@solana/spl-token";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LifecycleClient, PROGRAM_ID } from "../src/index.js";

const so = join(__dirname_(), "../../target/deploy/lifecycle_markets.so");
function __dirname_() { return new URL(".", import.meta.url).pathname; }
const hasValidator = spawnSync("which", ["solana-test-validator"]).status === 0 && existsSync(so);
const RPC = "http://127.0.0.1:8999";
let validator: ChildProcess;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (!hasValidator) return;
  const ledger = mkdtempSync(join(tmpdir(), "lm-ledger-"));
  validator = spawn("solana-test-validator", ["--reset", "--quiet", "--ledger", ledger, "--rpc-port", "8999", "--faucet-port", "9900",
    "--bpf-program", PROGRAM_ID.toBase58(), so], { stdio: "ignore" });
  const c = new Connection(RPC);
  for (let i = 0; i < 90; i++) { try { await c.getVersion(); return; } catch { await sleep(1000); } }
  throw new Error("validator did not start");
}, 120_000);
afterAll(() => { validator?.kill("SIGKILL"); });

async function fund(c: Connection, kp: Keypair) {
  const sig = await c.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
  await c.confirmTransaction(sig, "confirmed");
}

describe.skipIf(!hasValidator)("SDK e2e", () => {
  it("create -> buy -> sell -> resolve -> redeem -> claim", async () => {
    const conn = new Connection(RPC, "confirmed");
    const admin = Keypair.generate(), alice = Keypair.generate(), resolverKp = Keypair.generate();
    await Promise.all([admin, alice, resolverKp].map((k) => fund(conn, k)));
    const mint = await createMint(conn, admin, admin.publicKey, null, 6);
    const mk = (k: Keypair) => new LifecycleClient(new AnchorProvider(conn, new Wallet(k), { commitment: "confirmed" }));
    const adminC = mk(admin), aliceC = mk(alice), resolverC = mk(resolverKp);
    const adminAta = await getOrCreateAssociatedTokenAccount(conn, admin, mint, admin.publicKey);
    const aliceAta = await getOrCreateAssociatedTokenAccount(conn, admin, mint, alice.publicKey);
    await mintTo(conn, admin, mint, adminAta.address, admin, 5_000_000_000n);
    await mintTo(conn, admin, mint, aliceAta.address, admin, 5_000_000_000n);

    const slot = await conn.getSlot();
    const now = (await conn.getBlockTime(slot))!;
    const tokenRef = Keypair.generate().publicKey;
    const { market } = await adminC.createMarket({
      marketId: 1, tokenRef, threshold: 1_000_000_000_000n, expiryTs: now + 12, resolutionWindowSecs: 300,
      initialLiquidity: 1_000_000_000n, feeBps: 100, collateralMint: mint, resolver: resolverKp.publicKey,
    });
    let m = (await adminC.getMarket(market))!;
    expect(m.status).toBe("open");
    expect(m.yesReserve).toBe(1_000_000_000n);
    expect((await aliceC.listMarkets()).map((x) => x.address.toBase58())).toContain(market.toBase58());

    // buy: on-chain result must equal SDK quote
    const q = aliceC.quoteBuy(m, "yes", 100_000_000n);
    await aliceC.buy(m, "yes", 100_000_000n, q.sharesOut);
    m = (await aliceC.getMarket(market))!;
    expect([m.yesReserve, m.noReserve]).toEqual([q.newOwn, q.newOther]);
    const pos = (await aliceC.getPosition(market, alice.publicKey))!;
    expect(pos.yesShares).toBe(q.sharesOut);
    expect(await aliceC.getVaultBalance(m)).toBe(m.totalMinted + m.feesAccrued);

    // sell half
    const sq = aliceC.quoteSell(m, "yes", pos.yesShares / 2n);
    await aliceC.sell(m, "yes", pos.yesShares / 2n, sq.payout);
    m = (await aliceC.getMarket(market))!;
    expect([m.yesReserve, m.noReserve]).toEqual([sq.newOwn, sq.newOther]);

    // demo feed round trip
    await adminC.demoSetFeed(tokenRef, 1_500_000n, 1_000_000n, 50_000_000_000n);
    const feed = (await aliceC.getFeed(tokenRef))!;
    expect(feed.price).toBe(1_500_000n);
    expect(feed.authority.toBase58()).toBe(admin.publicKey.toBase58());

    // wait for expiry, resolve as the resolver key, redeem, claim
    for (;;) { const t = (await conn.getBlockTime(await conn.getSlot()))!; if (t >= now + 13) break; await sleep(1000); }
    const evidence = Buffer.alloc(32, 9);
    await expect(aliceC.resolve(m, "yes", evidence)).rejects.toThrow();
    await resolverC.resolve(m, "yes", evidence);
    m = (await aliceC.getMarket(market))!;
    expect(m.status).toBe("resolvedYes");
    expect(m.evidenceHash).toBe(evidence.toString("hex"));

    const before = (await getAccount(conn, aliceAta.address)).amount;
    await aliceC.redeem(m);
    const after = (await getAccount(conn, aliceAta.address)).amount;
    const posAfter = (await aliceC.getPosition(market, alice.publicKey))!;
    expect(after - before).toBe(posAfter.yesShares);
    expect(posAfter.redeemed).toBe(true);
    await expect(aliceC.redeem(m)).rejects.toThrow();

    await adminC.claimResidual(m);
    expect(await adminC.getVaultBalance(m)).toBe(0n);
  }, 180_000);
});
