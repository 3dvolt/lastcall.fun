#![allow(dead_code)]
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    lifecycle_markets::{
        error::MarketError, Market, MarketStatus, Outcome, Position, SampleBuffer, Side, SourceKind, FEED_SEED, MARKET_SEED,
        POSITION_SEED, SAMPLES_SEED, VAULT_SEED,
    },
    litesvm::{types::FailedTransactionMetadata, LiteSVM},
    litesvm_token::{get_spl_account, spl_token, CreateAccount, CreateMint, MintTo},
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
};

pub const T0: i64 = 1_000_000;
pub const ONE: u64 = 1_000_000; // 1 collateral token (6 decimals)

pub struct Env {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub mint: Pubkey,
    /// writes the demo feed (DemoFeed source, test builds only)
    pub publisher: Keypair,
}

pub struct User {
    pub kp: Keypair,
    pub ata: Pubkey,
}

#[derive(Debug)]
pub struct MarketKeys {
    pub market: Pubkey,
    pub vault: Pubkey,
    pub creator: Pubkey,
    pub samples: Pubkey,
    pub token_ref: Pubkey,
    pub expiry_ts: i64,
    pub window_secs: u32,
    pub interval_secs: u32,
}

/// Parameters of a market under test (defaults: 120 s window, 10 s slots = 12 slots, demo feed).
#[derive(Clone)]
pub struct Cfg {
    pub threshold: u64,
    pub window_secs: u32,
    pub interval_secs: u32,
    pub min_liquidity: u64,
    pub source: SourceKind,
    pub token_ref: Option<Pubkey>,
    pub source_account: Option<Pubkey>,
    pub oracle_authority: Option<Pubkey>,
}

impl Default for Cfg {
    fn default() -> Self {
        Cfg { threshold: 1_000_000 * ONE, window_secs: 120, interval_secs: 10, min_liquidity: 10_000 * ONE, source: SourceKind::DemoFeed, token_ref: None, source_account: None, oracle_authority: None }
    }
}

pub fn program_id() -> Pubkey {
    lifecycle_markets::id()
}

impl Env {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let default = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/lifecycle_markets.so");
        let path = std::env::var("LIFECYCLE_SO").unwrap_or_else(|_| default.to_string()); // lets tests run against the production build
        let bytes = std::fs::read(&path).unwrap_or_else(|_| panic!("missing {path}: run `bash scripts/build.sh test` before `cargo test`"));
        svm.add_program(program_id(), &bytes).unwrap();
        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000_000_000_000).unwrap();
        let mint = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
        let publisher = Keypair::new();
        svm.airdrop(&publisher.pubkey(), 1_000_000_000).unwrap();
        let mut env = Env { svm, admin, mint, publisher };
        env.set_time(T0);
        env
    }

    pub fn set_time(&mut self, ts: i64) {
        let mut c = self.svm.get_sysvar::<Clock>();
        c.unix_timestamp = ts;
        self.svm.set_sysvar(&c);
    }

    pub fn now(&self) -> i64 {
        self.svm.get_sysvar::<Clock>().unix_timestamp
    }

    pub fn new_user(&mut self, collateral: u64) -> User {
        let kp = Keypair::new();
        self.svm.airdrop(&kp.pubkey(), 1_000_000_000).unwrap();
        let ata = CreateAccount::new(&mut self.svm, &self.admin, &self.mint)
            .owner(&kp.pubkey())
            .send()
            .unwrap();
        if collateral > 0 {
            MintTo::new(&mut self.svm, &self.admin, &self.mint, &ata, collateral).send().unwrap();
        }
        User { kp, ata }
    }

    pub fn send(&mut self, ixs: &[Instruction], payer: &Keypair, extra: &[&Keypair]) -> Result<(), FailedTransactionMetadata> {
        self.svm.expire_blockhash();
        let bh = self.svm.latest_blockhash();
        let msg = Message::new_with_blockhash(ixs, Some(&payer.pubkey()), &bh);
        let mut signers: Vec<&Keypair> = vec![payer];
        signers.extend_from_slice(extra);
        let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &signers).unwrap();
        self.svm.send_transaction(tx).map(|_| ())
    }

    pub fn token_balance(&self, acc: &Pubkey) -> u64 {
        get_spl_account::<spl_token::state::Account>(&self.svm, acc).unwrap().amount
    }

    pub fn market(&self, key: &Pubkey) -> Market {
        let acc = self.svm.get_account(key).expect("market account");
        Market::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    pub fn position(&self, market: &Pubkey, user: &Pubkey) -> Option<Position> {
        let acc = self.svm.get_account(&position_pda(market, user))?;
        Some(Position::try_deserialize(&mut &acc.data[..]).unwrap())
    }

    // ---- instruction wrappers ----

    pub fn create_market(&mut self, creator: &User, market_id: u64, threshold: u64, expiry_ts: i64, liquidity: u64, fee_bps: u16) -> Result<MarketKeys, FailedTransactionMetadata> {
        self.create_market_cfg(creator, market_id, expiry_ts, liquidity, fee_bps, Cfg { threshold, ..Cfg::default() })
    }

    pub fn create_market_cfg(&mut self, creator: &User, market_id: u64, expiry_ts: i64, liquidity: u64, fee_bps: u16, cfg: Cfg) -> Result<MarketKeys, FailedTransactionMetadata> {
        let (market, _) = market_pda(&creator.kp.pubkey(), market_id);
        let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, market.as_ref()], &program_id());
        let samples = samples_pda(&market);
        let token_ref = cfg.token_ref.unwrap_or_else(Pubkey::new_unique);
        let source_account = cfg.source_account.unwrap_or_else(|| feed_pda(&token_ref));
        let oracle_authority = match (cfg.source, cfg.oracle_authority) {
            (_, Some(k)) => k,
            (SourceKind::DemoFeed, None) => self.publisher.pubkey(),
            (SourceKind::PumpSwap, None) => Pubkey::default(),
        };
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::CreateMarket {
                market_id,
                token_ref,
                threshold: cfg.threshold,
                expiry_ts,
                resolution_window_secs: cfg.window_secs,
                initial_liquidity: liquidity,
                fee_bps,
                sample_interval_secs: cfg.interval_secs,
                min_liquidity_usd: cfg.min_liquidity,
                source_kind: cfg.source,
                oracle_authority,
            }
            .data(),
            lifecycle_markets::accounts::CreateMarket {
                creator: creator.kp.pubkey(),
                market,
                collateral_mint: self.mint,
                vault,
                creator_collateral: creator.ata,
                token_mint: token_ref,
                source_account,
                sample_buffer: samples,
                token_program: spl_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &creator.kp, &[])?;
        Ok(MarketKeys { market, vault, creator: creator.kp.pubkey(), samples, token_ref, expiry_ts, window_secs: cfg.window_secs, interval_secs: cfg.interval_secs })
    }

    pub fn buy(&mut self, user: &User, m: &MarketKeys, side: Side, amount: u64, min_out: u64) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::Buy { side, collateral_in: amount, min_shares_out: min_out }.data(),
            lifecycle_markets::accounts::Buy {
                user: user.kp.pubkey(),
                market: m.market,
                position: position_pda(&m.market, &user.kp.pubkey()),
                user_collateral: user.ata,
                vault: m.vault,
                token_program: spl_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &user.kp, &[])
    }

    pub fn sell(&mut self, user: &User, m: &MarketKeys, side: Side, shares: u64, min_out: u64) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::Sell { side, shares_in: shares, min_collateral_out: min_out }.data(),
            lifecycle_markets::accounts::Sell {
                user: user.kp.pubkey(),
                market: m.market,
                position: position_pda(&m.market, &user.kp.pubkey()),
                user_collateral: user.ata,
                vault: m.vault,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &user.kp, &[])
    }

    /// Anyone can resolve: the outcome is computed on-chain from the recorded samples.
    pub fn resolve_by(&mut self, caller: &Keypair, m: &MarketKeys) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::Resolve {}.data(),
            lifecycle_markets::accounts::Resolve { caller: caller.pubkey(), market: m.market, sample_buffer: m.samples }.to_account_metas(None),
        );
        self.send(&[ix], caller, &[])
    }

    pub fn resolve(&mut self, m: &MarketKeys) -> Result<(), FailedTransactionMetadata> {
        let kp = Keypair::try_from(self.admin.to_bytes().as_slice()).unwrap();
        self.resolve_by(&kp, m)
    }

    pub fn record_sample_ix(&self, caller: &Pubkey, m: &MarketKeys, remaining: Vec<Pubkey>) -> Instruction {
        let mut metas = lifecycle_markets::accounts::RecordSample {
            recorder: *caller,
            market: m.market,
            sample_buffer: m.samples,
            instructions: INSTRUCTIONS_SYSVAR,
        }
        .to_account_metas(None);
        metas.extend(remaining.into_iter().map(|k| anchor_lang::solana_program::instruction::AccountMeta::new_readonly(k, false)));
        Instruction::new_with_bytes(program_id(), &lifecycle_markets::instruction::RecordSample {}.data(), metas)
    }

    /// DemoFeed source: record the current feed value.
    pub fn record_sample(&mut self, caller: &Keypair, m: &MarketKeys) -> Result<(), FailedTransactionMetadata> {
        let ix = self.record_sample_ix(&caller.pubkey(), m, vec![feed_pda(&m.token_ref)]);
        self.send(&[ix], caller, &[])
    }

    pub fn sample_buffer(&self, m: &MarketKeys) -> SampleBuffer {
        let acc = self.svm.get_account(&m.samples).expect("sample buffer");
        SampleBuffer::try_deserialize(&mut &acc.data[..]).unwrap()
    }

    /// Publish a feed value `mcap` (USD6) with the given liquidity, at the current clock.
    pub fn publish(&mut self, m: &MarketKeys, mcap: u64, liquidity: u64) -> Result<(), FailedTransactionMetadata> {
        let kp = Keypair::try_from(self.publisher.to_bytes().as_slice()).unwrap();
        self.set_feed(&kp, m.token_ref, mcap, 1, liquidity)
    }

    pub fn window_start(m: &MarketKeys) -> i64 {
        m.expiry_ts - i64::from(m.window_secs)
    }

    /// Fill slots with (mcap, liquidity) values: values[k] is recorded in slot k (None = nobody samples that slot).
    pub fn fill_window(&mut self, m: &MarketKeys, values: &[Option<(u64, u64)>]) {
        let sampler = Keypair::new();
        self.svm.airdrop(&sampler.pubkey(), 1_000_000_000).unwrap();
        for (k, v) in values.iter().enumerate() {
            if let Some((mcap, liq)) = v {
                self.set_time(Self::window_start(m) + k as i64 * i64::from(m.interval_secs) + 1);
                self.publish(m, *mcap, *liq).unwrap();
                self.record_sample(&sampler, m).unwrap_or_else(|e| panic!("slot {k}: {e:?}"));
            }
        }
    }

    /// expire the market without anybody sampling, then resolve it (permissionless)
    pub fn settle_nobody(&mut self, m: &MarketKeys) {
        self.set_time(m.expiry_ts);
        self.resolve(m).unwrap();
    }

    pub fn slots(m: &MarketKeys) -> usize {
        (m.window_secs as usize).div_ceil(m.interval_secs as usize)
    }

    /// Drive a (demo-feed) market to the requested outcome through the REAL on-chain flow:
    /// Yes = every slot far above the threshold, No = every slot far below, Void = nobody samples.
    pub fn settle(&mut self, m: &MarketKeys, outcome: Outcome) -> Result<(), FailedTransactionMetadata> {
        let mk = self.market(&m.market);
        let n = Self::slots(m);
        let vals: Vec<Option<(u64, u64)>> = match outcome {
            Outcome::Yes => vec![Some((mk.threshold.saturating_mul(2), mk.min_liquidity_usd * 5)); n],
            Outcome::No => vec![Some((mk.threshold / 2, mk.min_liquidity_usd * 5)); n],
            Outcome::Void => vec![],
        };
        self.fill_window(m, &vals);
        self.set_time(m.expiry_ts);
        self.resolve(m)
    }

    pub fn redeem(&mut self, user: &User, m: &MarketKeys) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::Redeem {}.data(),
            lifecycle_markets::accounts::Redeem {
                user: user.kp.pubkey(),
                market: m.market,
                position: position_pda(&m.market, &user.kp.pubkey()),
                user_collateral: user.ata,
                vault: m.vault,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &user.kp, &[])
    }

    pub fn claim_residual(&mut self, signer: &User, m: &MarketKeys) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::ClaimResidual {}.data(),
            lifecycle_markets::accounts::ClaimResidual {
                creator: signer.kp.pubkey(),
                market: m.market,
                creator_collateral: signer.ata,
                vault: m.vault,
                token_program: spl_token::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &signer.kp, &[])
    }

    pub fn set_feed(&mut self, authority: &Keypair, token_ref: Pubkey, price: u64, supply: u64, liq: u64) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::DemoSetFeed { token_ref, price, circulating_supply: supply, liquidity_usd: liq }.data(),
            lifecycle_markets::accounts::DemoSetFeed {
                authority: authority.pubkey(),
                feed: feed_pda(&token_ref),
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], authority, &[])
    }
}

pub fn market_pda(creator: &Pubkey, id: u64) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[MARKET_SEED, creator.as_ref(), &id.to_le_bytes()], &program_id())
}
pub fn samples_pda(market: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[SAMPLES_SEED, market.as_ref()], &program_id()).0
}
pub const INSTRUCTIONS_SYSVAR: Pubkey = Pubkey::from_str_const("Sysvar1nstructions1111111111111111111111111");
pub fn position_pda(market: &Pubkey, user: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[POSITION_SEED, market.as_ref(), user.as_ref()], &program_id()).0
}
pub fn feed_pda(token_ref: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[FEED_SEED, token_ref.as_ref()], &program_id()).0
}

/// Assert a failed tx carries the given Anchor custom error.
pub fn assert_market_err<T: std::fmt::Debug>(res: Result<T, FailedTransactionMetadata>, expected: MarketError) {
    use solana_transaction::TransactionError;
    let code = anchor_lang::error::ERROR_CODE_OFFSET + expected as u32;
    match res {
        Ok(v) => panic!("expected error {expected:?}, but succeeded: {v:?}"),
        Err(e) => match e.err {
            TransactionError::InstructionError(_, solana_transaction::InstructionError::Custom(c)) => {
                assert_eq!(c, code, "expected {expected:?} ({code}), got custom {c}\n{}", e.meta.pretty_logs())
            }
            other => panic!("expected {expected:?}, got {other:?}\n{}", e.meta.pretty_logs()),
        },
    }
}

pub fn status_is_resolved(s: MarketStatus) -> bool {
    s != MarketStatus::Open
}

/// The custom error code of a failed transaction, if any (Anchor constraint errors are 2000..2999, program errors 6000+).
pub fn custom_code<T>(res: &Result<T, FailedTransactionMetadata>) -> Option<u32> {
    use solana_transaction::TransactionError;
    match res {
        Err(e) => match &e.err {
            TransactionError::InstructionError(_, solana_transaction::InstructionError::Custom(c)) => Some(*c),
            _ => None,
        },
        Ok(_) => None,
    }
}
pub fn assert_failed<T: std::fmt::Debug>(res: Result<T, FailedTransactionMetadata>, what: &str) {
    assert!(res.is_err(), "{what}: expected the transaction to be rejected, but it succeeded: {res:?}");
}
