import * as anchorNs from "@anchor-lang/core";
import type { Program as ProgramType, Provider } from "@anchor-lang/core";
import { getAssociatedTokenAddressSync, getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { PublicKey, Transaction, TransactionInstruction, type Connection } from "@solana/web3.js";
import { parseFeed, parseMarket, parsePosition, parseSampleBuffer } from "./accounts.js";
import { PROGRAM_ID } from "./constants.js";
import { feedPda, marketPda, positionPda, samplesPda, vaultPda } from "./pda.js";
import { parsePool, PYTH_SOL_USD_ACCOUNT } from "./sources.js";
import { quoteBuy, quoteSell, type BuyQuote, type SellQuote } from "./math.js";
import type {
  CreateMarketParams, FeedAccount, MarketAccount, PositionAccount, SampleBufferAccount, Side,
} from "./types.js";
import idl from "./idl/lifecycle_markets.json" with { type: "json" };
import type { LifecycleMarkets } from "./idl/lifecycle_markets.js";

// @anchor-lang/core is CommonJS: take runtime values from the default export so plain Node ESM can load this package.
// Node ESM exposes the CJS module as `default`; bundlers (Vite) expose named exports. Support both.
const anchor = ((anchorNs as unknown as { default?: typeof anchorNs }).default ?? anchorNs) as typeof anchorNs;
const { BN, EventParser, Program } = anchor;
const sideArg = (s: Side) => (s === "yes" ? { yes: {} } : { no: {} });
const bn = (x: bigint | number) => new BN(x.toString());

/**
 * High-level client. The provider's wallet is the signer of every transaction it sends:
 *  - createMarket/claimResidual: the market creator
 *  - buy/sell/redeem: the trader
 *  - recordSample / resolve: ANYONE (permissionless; the program computes everything on-chain)
 *  - demoSetFeed: the demo feed authority (test builds only)
 * Use the `ix*` methods to get raw instructions (e.g. to compose with wallet-adapter).
 */
export class LifecycleClient {
  readonly program: ProgramType<LifecycleMarkets>;
  readonly programId: PublicKey;

  /** RPC used ONLY for getProgramAccounts (listing markets). Some providers disable it on free plans; the public Solana RPC allows it. */
  private listConnection?: Connection;

  constructor(readonly provider: Provider, programId: PublicKey = PROGRAM_ID, listConnection?: Connection) {
    this.listConnection = listConnection;
    this.programId = programId;
    this.program = new Program<LifecycleMarkets>({ ...(idl as object), address: programId.toBase58() } as LifecycleMarkets, provider);
  }

  get connection(): Connection { return this.provider.connection; }
  get wallet(): PublicKey { return this.provider.publicKey!; }

  // ---------- PDAs ----------
  marketAddress(creator: PublicKey, marketId: bigint | number) { return marketPda(creator, marketId, this.programId); }
  vaultAddress(market: PublicKey) { return vaultPda(market, this.programId); }
  positionAddress(market: PublicKey, user: PublicKey) { return positionPda(market, user, this.programId); }
  feedAddress(tokenRef: PublicKey) { return feedPda(tokenRef, this.programId); }

  // ---------- reads ----------
  async getMarket(market: PublicKey): Promise<MarketAccount | null> {
    const a = await this.program.account.market.fetchNullable(market);
    return a ? parseMarket(market, a) : null;
  }

  /**
   * All markets of the program (getProgramAccounts filtered by the Market discriminator).
   * Some RPC providers disable getProgramAccounts on free plans: pass `known` market addresses and they are read directly instead.
   */
  async listMarkets(known: PublicKey[] = []): Promise<MarketAccount[]> {
    try {
      const listProgram = this.listConnection
        ? new Program<LifecycleMarkets>({ ...(idl as object), address: this.programId.toBase58() } as LifecycleMarkets, { connection: this.listConnection } as unknown as Provider)
        : this.program;
      const all = await listProgram.account.market.all();
      return all.map((x) => parseMarket(x.publicKey, x.account));
    } catch (e) {
      if (known.length === 0) throw e;
      const out: MarketAccount[] = [];
      for (let i = 0; i < known.length; i += 100) {
        const chunk = known.slice(i, i + 100);
        const infos = await this.connection.getMultipleAccountsInfo(chunk, "confirmed");
        infos.forEach((info, j) => {
          if (!info || !info.owner.equals(this.programId)) return;
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const decoded = (this.program.coder.accounts as any).decode("market", info.data);
            out.push(parseMarket(chunk[j], decoded));
          } catch { /* not a Market account */ }
        });
      }
      return out;
    }
  }

  async getPosition(market: PublicKey, user: PublicKey): Promise<PositionAccount | null> {
    const addr = this.positionAddress(market, user);
    const a = await this.program.account.position.fetchNullable(addr);
    return a ? parsePosition(addr, a) : null;
  }

  async getFeed(tokenRef: PublicKey): Promise<FeedAccount | null> {
    const addr = this.feedAddress(tokenRef);
    const a = await this.program.account.demoFeed.fetchNullable(addr);
    return a ? parseFeed(addr, a) : null;
  }

  async getVaultBalance(market: MarketAccount): Promise<bigint> {
    return (await getAccount(this.connection, market.vault)).amount;
  }

  // ---------- quotes (mirror the on-chain math exactly) ----------
  quoteBuy(m: Pick<MarketAccount, "yesReserve" | "noReserve" | "feeBps">, side: Side, collateralIn: bigint): BuyQuote {
    const [own, other] = side === "yes" ? [m.yesReserve, m.noReserve] : [m.noReserve, m.yesReserve];
    return quoteBuy(own, other, collateralIn, m.feeBps);
  }
  quoteSell(m: Pick<MarketAccount, "yesReserve" | "noReserve" | "feeBps">, side: Side, sharesIn: bigint): SellQuote {
    const [own, other] = side === "yes" ? [m.yesReserve, m.noReserve] : [m.noReserve, m.yesReserve];
    return quoteSell(own, other, sharesIn, m.feeBps);
  }

  // ---------- instruction builders ----------
  async ixCreateMarket(p: CreateMarketParams): Promise<{ ix: TransactionInstruction; market: PublicKey; vault: PublicKey; samples: PublicKey }> {
    const creator = this.wallet;
    const market = this.marketAddress(creator, p.marketId);
    const vault = this.vaultAddress(market);
    const samples = samplesPda(market, this.programId);
    const pump = p.source.kind === "pumpSwap";
    const ix = await this.program.methods
      .createMarket(
        bn(p.marketId), p.tokenRef, bn(p.threshold), bn(p.expiryTs), p.resolutionWindowSecs, bn(p.initialLiquidity), p.feeBps,
        p.sampleIntervalSecs, bn(p.minLiquidityUsd), pump ? { pumpSwap: {} } : { demoFeed: {} },
        p.source.kind === "demoFeed" ? p.source.oracleAuthority : PublicKey.default,
      )
      .accountsPartial({
        creator, market, collateralMint: p.collateralMint, vault,
        creatorCollateral: p.creatorCollateral ?? getAssociatedTokenAddressSync(p.collateralMint, creator),
        tokenMint: p.tokenRef,
        sourceAccount: p.source.kind === "pumpSwap" ? p.source.pool : this.feedAddress(p.tokenRef),
        sampleBuffer: samples, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
    return { ix, market, vault, samples };
  }

  async ixBuy(m: MarketAccount, side: Side, collateralIn: bigint, minSharesOut: bigint, userCollateral?: PublicKey) {
    const user = this.wallet;
    return this.program.methods
      .buy(sideArg(side), bn(collateralIn), bn(minSharesOut))
      .accountsPartial({
        user, market: m.address, position: this.positionAddress(m.address, user),
        userCollateral: userCollateral ?? getAssociatedTokenAddressSync(m.collateralMint, user),
        vault: m.vault, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixSell(m: MarketAccount, side: Side, sharesIn: bigint, minCollateralOut: bigint, userCollateral?: PublicKey) {
    const user = this.wallet;
    return this.program.methods
      .sell(sideArg(side), bn(sharesIn), bn(minCollateralOut))
      .accountsPartial({
        user, market: m.address, position: this.positionAddress(m.address, user),
        userCollateral: userCollateral ?? getAssociatedTokenAddressSync(m.collateralMint, user),
        vault: m.vault, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixRedeem(m: MarketAccount, userCollateral?: PublicKey) {
    const user = this.wallet;
    return this.program.methods
      .redeem()
      .accountsPartial({
        user, market: m.address, position: this.positionAddress(m.address, user),
        userCollateral: userCollateral ?? getAssociatedTokenAddressSync(m.collateralMint, user),
        vault: m.vault, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  async ixClaimResidual(m: MarketAccount, creatorCollateral?: PublicKey) {
    return this.program.methods
      .claimResidual()
      .accountsPartial({
        creator: this.wallet, market: m.address,
        creatorCollateral: creatorCollateral ?? getAssociatedTokenAddressSync(m.collateralMint, this.wallet),
        vault: m.vault, tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  /** The extra accounts the program needs to price this market (verified on-chain against what the market registered). */
  async sampleAccounts(m: MarketAccount): Promise<PublicKey[]> {
    if (m.sourceKind === "demoFeed") return [m.sourcePool];
    const info = await this.connection.getAccountInfo(m.sourcePool, "confirmed");
    if (!info) throw new Error("pool account not found");
    const p = parsePool(info.data);
    return [m.sourcePool, p.baseVault, p.quoteVault, p.baseMint, PYTH_SOL_USD_ACCOUNT];
  }

  /** Permissionless, only inside the final window. Must be sent as its own transaction (plus optional compute-budget). */
  async ixRecordSample(m: MarketAccount) {
    const extra = await this.sampleAccounts(m);
    return this.program.methods
      .recordSample()
      .accountsPartial({ recorder: this.wallet, market: m.address, sampleBuffer: samplesPda(m.address, this.programId) })
      .remainingAccounts(extra.map((pubkey) => ({ pubkey, isSigner: false, isWritable: false })))
      .instruction();
  }

  /** Permissionless after expiry: the program computes the outcome from the recorded samples. */
  async ixResolve(m: MarketAccount) {
    return this.program.methods
      .resolve()
      .accountsPartial({ caller: this.wallet, market: m.address, sampleBuffer: samplesPda(m.address, this.programId) })
      .instruction();
  }

  async getSampleBuffer(m: MarketAccount): Promise<SampleBufferAccount | null> {
    const a = await this.program.account.sampleBuffer.fetchNullable(samplesPda(m.address, this.programId));
    return a ? parseSampleBuffer(m.sampleSlots, a) : null;
  }

  async ixDemoSetFeed(tokenRef: PublicKey, price: bigint, circulatingSupply: bigint, liquidityUsd: bigint) {
    return this.program.methods
      .demoSetFeed(tokenRef, bn(price), bn(circulatingSupply), bn(liquidityUsd))
      .accountsPartial({ authority: this.wallet, feed: this.feedAddress(tokenRef) })
      .instruction();
  }

  // ---------- send helpers ----------
  /**
   * Signs with the provider wallet, sends, and confirms by polling signature status (no websocket subscription:
   * those proved flaky under many concurrent clients on local validators).
   */
  async send(...ixs: TransactionInstruction[]): Promise<string> {
    const tx = new Transaction().add(...ixs);
    const conn = this.connection;
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = this.wallet;
    const signed = await this.provider.wallet!.signTransaction(tx);
    const signature = await conn.sendRawTransaction(signed.serialize(), { preflightCommitment: "confirmed" });
    for (let polls = 0; ; polls++) {
      const st = await conn.getSignatureStatuses([signature]).then((r) => r.value[0]).catch(() => null); // a timed-out poll is just retried
      if (st?.err) {
        const t = await conn.getTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 }).catch(() => null);
        throw new Error(`transaction ${signature} failed: ${JSON.stringify(st.err)}\n${(t?.meta?.logMessages ?? []).join("\n")}`);
      }
      if (st && (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")) return signature;
      const height = await conn.getBlockHeight("confirmed").catch(() => 0);
      if (height > lastValidBlockHeight) throw new Error(`transaction ${signature} expired`);
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  async createMarket(p: CreateMarketParams) {
    const { ix, market, vault, samples } = await this.ixCreateMarket(p);
    const signature = await this.send(ix);
    return { signature, market, vault, samples };
  }
  async buy(m: MarketAccount, side: Side, collateralIn: bigint, minSharesOut: bigint) {
    return this.send(await this.ixBuy(m, side, collateralIn, minSharesOut));
  }
  async sell(m: MarketAccount, side: Side, sharesIn: bigint, minCollateralOut: bigint) {
    return this.send(await this.ixSell(m, side, sharesIn, minCollateralOut));
  }
  async redeem(m: MarketAccount) { return this.send(await this.ixRedeem(m)); }
  async claimResidual(m: MarketAccount) { return this.send(await this.ixClaimResidual(m)); }
  async recordSample(m: MarketAccount) { return this.send(await this.ixRecordSample(m)); }
  async resolve(m: MarketAccount) { return this.send(await this.ixResolve(m)); }
  async demoSetFeed(tokenRef: PublicKey, price: bigint, circulatingSupply: bigint, liquidityUsd: bigint) {
    return this.send(await this.ixDemoSetFeed(tokenRef, price, circulatingSupply, liquidityUsd));
  }

  // ---------- events ----------
  /** Decode program events from transaction log lines. */
  parseEvents(logs: string[]) {
    const parser = new EventParser(this.programId, this.program.coder);
    return [...parser.parseLogs(logs)];
  }
}
