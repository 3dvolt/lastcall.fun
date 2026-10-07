import { AnchorProvider, Wallet } from "@anchor-lang/core";
import { LifecycleClient, PROGRAM_ID } from "@lifecycle-markets/sdk";
import { Connection } from "@solana/web3.js";
import { createApi } from "./api.js";
import { loadConfig } from "./config.js";
import { MockProvider } from "./provider.js";
import { assertDevnetOrLocal } from "./safety.js";
import { ResolverService } from "./service.js";
import { FileStore } from "./store.js";

async function main() {
  const cfg = loadConfig();
  const cluster = await assertDevnetOrLocal(cfg.rpcUrl);
  const conn = new Connection(cfg.rpcUrl, "confirmed");
  const client = new LifecycleClient(new AnchorProvider(conn, new Wallet(cfg.resolverKeypair), { commitment: "confirmed" }), cfg.programId ?? PROGRAM_ID);
  const bal = await conn.getBalance(cfg.resolverKeypair.publicKey);
  if (bal < 50_000_000) {
    try { await conn.confirmTransaction(await conn.requestAirdrop(cfg.resolverKeypair.publicKey, 1_000_000_000), "confirmed"); console.log("[resolver] airdropped 1 SOL for fees"); }
    catch { console.warn(`[resolver] WARNING: resolver ${cfg.resolverKeypair.publicKey.toBase58()} has ${bal / 1e9} SOL and airdrop failed; fund it (https://faucet.solana.com) or resolves will fail`); }
  }
  const store = new FileStore(cfg.dataDir);
  const provider = new MockProvider(client, cfg.demoAuthority); // MOCK feed — see CONTRACT.md §12
  const svc = new ResolverService({ client, provider, store, params: cfg.params, windowOverrideSecs: cfg.windowOverrideSecs, allowedCreators: cfg.allowedCreators });

  const app = createApi(svc, store, {
    programId: client.programId.toBase58(), cluster, resolver: cfg.resolverKeypair.publicKey.toBase58(),
    demoAuthority: cfg.demoAuthority.toBase58(), provider: provider.name,
  });
  app.listen(cfg.port, () => console.log(`[resolver] API on :${cfg.port} | cluster=${cluster} resolver=${cfg.resolverKeypair.publicKey.toBase58()} program=${client.programId.toBase58()}`));

  const every = (fn: () => Promise<void>, ms: number, name: string) => {
    let busy = false;
    setInterval(async () => {
      if (busy) return;
      busy = true;
      try { await fn(); } catch (e) { console.error(`[resolver] ${name}: ${(e as Error).message}`); } finally { busy = false; }
    }, ms);
  };
  await svc.refreshMarkets();
  await svc.sampleOnce();
  every(() => svc.refreshMarkets(), 15_000, "refresh");
  every(() => svc.sampleOnce(), cfg.params.sampleIntervalSecs * 1000, "sampler");
  every(() => svc.resolveDue(), 5_000, "resolver");
}

main().catch((e) => { console.error(e); process.exit(1); });
