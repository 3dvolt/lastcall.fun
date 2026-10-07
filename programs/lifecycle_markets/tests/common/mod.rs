#![allow(dead_code)]
use {
    anchor_lang::{
        prelude::{Clock, Pubkey},
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    lifecycle_markets::{
        error::MarketError, Market, MarketStatus, Outcome, Position, Side, FEED_SEED, MARKET_SEED, POSITION_SEED,
        VAULT_SEED,
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
    pub resolver: Keypair,
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
}

pub fn program_id() -> Pubkey {
    lifecycle_markets::id()
}

impl Env {
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/deploy/lifecycle_markets.so");
        let bytes = std::fs::read(path).expect("run `anchor build` before `cargo test`");
        svm.add_program(program_id(), &bytes).unwrap();
        let admin = Keypair::new();
        svm.airdrop(&admin.pubkey(), 1_000_000_000_000).unwrap();
        let mint = CreateMint::new(&mut svm, &admin).decimals(6).send().unwrap();
        let resolver = Keypair::new();
        svm.airdrop(&resolver.pubkey(), 1_000_000_000).unwrap();
        let mut env = Env { svm, admin, mint, resolver };
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

    pub fn create_market(
        &mut self,
        creator: &User,
        market_id: u64,
        threshold: u64,
        expiry_ts: i64,
        liquidity: u64,
        fee_bps: u16,
    ) -> Result<MarketKeys, FailedTransactionMetadata> {
        let (market, _) = market_pda(&creator.kp.pubkey(), market_id);
        let (vault, _) = Pubkey::find_program_address(&[VAULT_SEED, market.as_ref()], &program_id());
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::CreateMarket {
                market_id,
                token_ref: Pubkey::new_unique(),
                threshold,
                expiry_ts,
                resolution_window_secs: 300,
                initial_liquidity: liquidity,
                fee_bps,
            }
            .data(),
            lifecycle_markets::accounts::CreateMarket {
                creator: creator.kp.pubkey(),
                market,
                collateral_mint: self.mint,
                vault,
                creator_collateral: creator.ata,
                resolver: self.resolver.pubkey(),
                token_program: spl_token::ID,
                system_program: system_program::ID,
            }
            .to_account_metas(None),
        );
        self.send(&[ix], &creator.kp, &[])?;
        Ok(MarketKeys { market, vault, creator: creator.kp.pubkey() })
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

    pub fn resolve_as(&mut self, signer: &Keypair, m: &MarketKeys, outcome: Outcome, hash: [u8; 32]) -> Result<(), FailedTransactionMetadata> {
        let ix = Instruction::new_with_bytes(
            program_id(),
            &lifecycle_markets::instruction::Resolve { outcome, evidence_hash: hash }.data(),
            lifecycle_markets::accounts::Resolve { resolver: signer.pubkey(), market: m.market }.to_account_metas(None),
        );
        self.send(&[ix], signer, &[])
    }

    pub fn resolve(&mut self, m: &MarketKeys, outcome: Outcome) -> Result<(), FailedTransactionMetadata> {
        let kp = Keypair::try_from(self.resolver.to_bytes().as_slice()).unwrap();
        self.resolve_as(&kp, m, outcome, [7u8; 32])
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
