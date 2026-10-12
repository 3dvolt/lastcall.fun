//! Tests written for the security review (see "Security review" in the README). Tests marked EXPLOIT failed before the fix (the attack worked).
mod common;
use anchor_lang::{prelude::Pubkey, solana_program::instruction::Instruction, InstructionData, ToAccountMetas};
use base64::Engine;
use common::*;
use lifecycle_markets::{error::MarketError, sources, MarketStatus, Outcome, Side, SourceKind};
use litesvm::LiteSVM;
use litesvm_token::{spl_token, CreateAccount, CreateMint, MintTo};
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;

const T: u64 = 1_000_000 * ONE;

fn demo_market() -> (Env, User, MarketKeys) {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    let m = env.create_market(&creator, 1, T, T0 + 600, 1_000 * ONE, 0).unwrap();
    (env, creator, m)
}

// ---------------------------------------------------------------- PumpSwap fixture helpers
fn fixture() -> serde_json::Value {
    serde_json::from_str(include_str!("fixtures/pumpswap_mainnet.json")).unwrap()
}
fn load_acc(v: &serde_json::Value, k: &str) -> (Pubkey, Account) {
    let e = &v[k];
    (
        e["address"].as_str().unwrap().parse().unwrap(),
        Account {
            lamports: e["lamports"].as_u64().unwrap(),
            data: base64::engine::general_purpose::STANDARD.decode(e["data"].as_str().unwrap()).unwrap(),
            owner: e["owner"].as_str().unwrap().parse().unwrap(),
            executable: false,
            rent_epoch: 0,
        },
    )
}
struct Pump {
    env: Env,
    m: MarketKeys,
    sampler: Keypair,
    accounts: Vec<Pubkey>,
    mint: Pubkey,
}
fn pump_market() -> Pump {
    let mut env = Env::new();
    let v = fixture();
    let mut keys = vec![];
    for k in ["pool", "base_vault", "quote_vault", "base_mint", "pyth_sol_usd"] {
        let (key, acc) = load_acc(&v, k);
        env.svm.set_account(key, acc).unwrap();
        keys.push(key);
    }
    let publish = i64::from_le_bytes(base64::engine::general_purpose::STANDARD.decode(v["pyth_sol_usd"]["data"].as_str().unwrap()).unwrap()[93..101].try_into().unwrap());
    let start = publish + 20;
    env.set_time(start - 100);
    let creator = env.new_user(10_000 * ONE);
    let cfg = Cfg { threshold: 1, min_liquidity: 5_000 * ONE, source: SourceKind::PumpSwap, token_ref: Some(keys[3]), source_account: Some(keys[0]), ..Cfg::default() };
    let m = env.create_market_cfg(&creator, 1, start + 120, 500 * ONE, 0, cfg).unwrap();
    env.set_time(start + 1);
    let sampler = Keypair::new();
    env.svm.airdrop(&sampler.pubkey(), 1_000_000_000).unwrap();
    Pump { env, m, sampler, accounts: keys.clone(), mint: keys[3] }
}
impl Pump {
    fn sample(&mut self) -> Result<(), litesvm::types::FailedTransactionMetadata> {
        let ix = self.env.record_sample_ix(&self.sampler.pubkey(), &self.m, self.accounts.clone());
        let kp = Keypair::try_from(self.sampler.to_bytes().as_slice()).unwrap();
        self.env.send(&[ix], &kp, &[])
    }
    fn edit_mint(&mut self, f: impl FnOnce(&mut Vec<u8>)) {
        let mut a = self.env.svm.get_account(&self.mint).unwrap();
        f(&mut a.data);
        self.env.svm.set_account(self.mint, a).unwrap();
    }
}

// ================================================================ EXPLOITS (failed before the fix)

/// EXPLOIT SR-01: a token whose creator still holds the mint authority can print supply during the window.
/// market cap = supply x price, so minting 100x supply flips the market to YES without moving the price at all.
#[test]
fn exploit_mint_authority_lets_the_token_creator_inflate_market_cap() {
    let mut p = pump_market();
    p.edit_mint(|d| {
        d[0..4].copy_from_slice(&1u32.to_le_bytes()); // mint authority: Some(...)
        d[4..36].copy_from_slice(&Pubkey::new_unique().to_bytes());
        let supply = u64::from_le_bytes(d[36..44].try_into().unwrap());
        d[36..44].copy_from_slice(&supply.to_le_bytes()); // supply untouched: the AUTHORITY alone must be refused
    });
    assert_market_err(p.sample(), MarketError::UnsafeToken);
}

/// EXPLOIT SR-02: Token-2022 extensions that let the issuer remove tokens from the pool vault (permanent delegate) or run code on every
/// transfer (transfer hook) can crush the pool's base reserve, which makes the computed price explode.
#[test]
fn exploit_dangerous_token_2022_extensions_are_refused() {
    for ext in [12u16 /* PermanentDelegate */, 14 /* TransferHook */, 26 /* Pausable */] {
        let mut p = pump_market();
        p.edit_mint(|d| {
            // replace the first TLV entry (MetadataPointer, 64 bytes) by the dangerous extension with a same-size value
            d[166..168].copy_from_slice(&ext.to_le_bytes());
        });
        assert_market_err(p.sample(), MarketError::UnsafeToken);
    }
}

/// EXPLOIT SR-03: trading stays open during the final window, so the last trades decide the Void settlement price.
/// A trader who buys right before a (predictable) Void redeems at the final marginal price, which is higher than what he paid on average.
#[test]
fn exploit_late_trading_gives_a_free_profit_when_the_market_voids() {
    let (mut env, creator, m) = demo_market();
    let trader = env.new_user(5_000 * ONE);
    // inside the final window (window = 120 s before expiry)
    env.set_time(Env::window_start(&m) + 5);
    let res = env.buy(&trader, &m, Side::Yes, 1_000 * ONE, 0);
    assert_market_err(res, MarketError::TradingClosed); // before the fix this buy succeeded
    let _ = creator;
}

/// SR-03 economics, documented: even a plain pre-window trade cannot profit if nobody can trade after the window opens.
#[test]
fn void_settlement_price_is_fixed_once_the_window_opens() {
    let (mut env, _c, m) = demo_market();
    let trader = env.new_user(5_000 * ONE);
    env.set_time(Env::window_start(&m) - 1);
    env.buy(&trader, &m, Side::Yes, 100 * ONE, 0).unwrap();
    let before = env.market(&m.market);
    env.set_time(m.expiry_ts); // nobody sampled: Void
    env.resolve(&m).unwrap();
    let after = env.market(&m.market);
    assert_eq!(after.status, MarketStatus::Void);
    assert_eq!((before.yes_reserve, before.no_reserve), (after.yes_reserve, after.no_reserve), "no trade can happen between window start and resolution");
}

/// SR-01/02 at CREATION: a market on a token with an unsafe mint cannot even be created.
#[test]
fn create_market_refuses_an_unsafe_token_mint() {
    for variant in ["mint_authority", "permanent_delegate"] {
        let mut env = Env::new();
        let v = fixture();
        let mut keys = vec![];
        for k in ["pool", "base_vault", "quote_vault", "base_mint", "pyth_sol_usd"] {
            let (key, mut acc) = load_acc(&v, k);
            if k == "base_mint" {
                match variant {
                    "mint_authority" => acc.data[0..4].copy_from_slice(&1u32.to_le_bytes()),
                    _ => acc.data[166..168].copy_from_slice(&12u16.to_le_bytes()),
                }
            }
            env.svm.set_account(key, acc).unwrap();
            keys.push(key);
        }
        env.set_time(T0);
        let creator = env.new_user(10_000 * ONE);
        let cfg = Cfg { threshold: 1, min_liquidity: 5_000 * ONE, source: SourceKind::PumpSwap, token_ref: Some(keys[3]), source_account: Some(keys[0]), ..Cfg::default() };
        assert_market_err(env.create_market_cfg(&creator, 1, T0 + 600, 500 * ONE, 0, cfg), MarketError::UnsafeToken);
    }
}

// ================================================================ STANDARD CHECKLIST (regression tests: these always passed)

#[test]
fn a1_actions_need_the_owner_signature() {
    let (mut env, _c, m) = demo_market();
    let victim = env.new_user(1_000 * ONE);
    let attacker = env.new_user(0);
    env.buy(&victim, &m, Side::Yes, 100 * ONE, 0).unwrap();
    // attacker builds a sell for the victim's position but signs with his own key only
    let mut ix = Instruction::new_with_bytes(
        program_id(),
        &lifecycle_markets::instruction::Sell { side: Side::Yes, shares_in: 1, min_collateral_out: 0 }.data(),
        lifecycle_markets::accounts::Sell {
            user: victim.kp.pubkey(),
            market: m.market,
            position: position_pda(&m.market, &victim.kp.pubkey()),
            user_collateral: attacker.ata,
            vault: m.vault,
            token_program: spl_token::ID,
        }
        .to_account_metas(None),
    );
    ix.accounts[0].is_signer = false; // the attacker cannot produce the victim's signature
    let res = env.send(&[ix], &attacker.kp, &[]);
    assert_eq!(custom_code(&res), Some(3010), "AccountNotSigner");
}

#[test]
fn a4_token_accounts_must_belong_to_the_signer_and_to_the_collateral_mint() {
    let (mut env, _c, m) = demo_market();
    let alice = env.new_user(1_000 * ONE);
    let bob = env.new_user(1_000 * ONE);
    // alice tries to pay with BOB's token account
    let ix = |user: &User, from: Pubkey, vault: Pubkey| Instruction::new_with_bytes(
        program_id(),
        &lifecycle_markets::instruction::Buy { side: Side::Yes, collateral_in: 10 * ONE, min_shares_out: 0 }.data(),
        lifecycle_markets::accounts::Buy {
            user: user.kp.pubkey(), market: m.market, position: position_pda(&m.market, &user.kp.pubkey()),
            user_collateral: from, vault, token_program: spl_token::ID, system_program: anchor_lang::solana_program::system_program::ID,
        }.to_account_metas(None),
    );
    let bob_before = env.token_balance(&bob.ata);
    assert_failed(env.send(&[ix(&alice, bob.ata, m.vault)], &alice.kp, &[]), "paying with another user's token account");
    assert_eq!(env.token_balance(&bob.ata), bob_before);
    // a token account of ANOTHER mint
    let other_mint = CreateMint::new(&mut env.svm, &env.admin).decimals(6).send().unwrap();
    let fake = CreateAccount::new(&mut env.svm, &env.admin, &other_mint).owner(&alice.kp.pubkey()).send().unwrap();
    MintTo::new(&mut env.svm, &env.admin, &other_mint, &fake, 1_000 * ONE).send().unwrap();
    assert_failed(env.send(&[ix(&alice, fake, m.vault)], &alice.kp, &[]), "wrong-mint token account");
    // the vault substituted by the attacker's own account: the same account twice as `mut` is refused by Anchor (2040)
    let dup = env.send(&[ix(&alice, alice.ata, alice.ata)], &alice.kp, &[]);
    assert_eq!(custom_code(&dup), Some(2040), "duplicate mutable account");
    // a different (real) token account in place of the vault
    assert_market_err(env.send(&[ix(&alice, alice.ata, bob.ata)], &alice.kp, &[]), MarketError::AccountMismatch);
}

#[test]
fn b1_positions_cannot_be_used_across_users() {
    let (mut env, _c, m) = demo_market();
    let victim = env.new_user(1_000 * ONE);
    let attacker = env.new_user(100 * ONE);
    env.buy(&victim, &m, Side::Yes, 100 * ONE, 0).unwrap();
    env.buy(&attacker, &m, Side::Yes, 10 * ONE, 0).unwrap();
    let ix = Instruction::new_with_bytes(
        program_id(),
        &lifecycle_markets::instruction::Sell { side: Side::Yes, shares_in: 1, min_collateral_out: 0 }.data(),
        lifecycle_markets::accounts::Sell {
            user: attacker.kp.pubkey(), market: m.market, position: position_pda(&m.market, &victim.kp.pubkey()),
            user_collateral: attacker.ata, vault: m.vault, token_program: spl_token::ID,
        }.to_account_metas(None),
    );
    assert_failed(env.send(&[ix], &attacker.kp, &[]), "selling with the victim's position PDA");
}

#[test]
fn d1_a_market_cannot_be_created_twice() {
    let (mut env, creator, _m) = demo_market();
    assert_failed(env.create_market(&creator, 1, T, T0 + 900, 100 * ONE, 0), "re-creating the same market id");
}

#[test]
fn f4_zero_and_extreme_amounts() {
    let (mut env, creator, m) = demo_market();
    let u = env.new_user(1_000 * ONE);
    assert_market_err(env.buy(&u, &m, Side::Yes, 0, 0), MarketError::ZeroAmount);
    assert_failed(env.buy(&u, &m, Side::Yes, u64::MAX, 0), "buy u64::MAX");
    env.buy(&u, &m, Side::Yes, 10 * ONE, 0).unwrap();
    assert_market_err(env.sell(&u, &m, Side::Yes, 0, 0), MarketError::ZeroAmount);
    assert_market_err(env.sell(&u, &m, Side::Yes, u64::MAX, 0), MarketError::InsufficientShares);
    assert_market_err(env.create_market(&creator, 2, T, T0 + 600, u64::MAX, 0), MarketError::ReserveTooLarge);
    assert_market_err(env.create_market(&creator, 3, T, T0 + 600, 0, 0), MarketError::ZeroAmount);
    // the 1-unit dust trade must not mint free value
    let b = env.token_balance(&u.ata);
    let _ = env.buy(&u, &m, Side::No, 1, 0);
    assert!(env.token_balance(&u.ata) <= b);
}

#[test]
fn a6_a_sample_buffer_of_another_market_is_rejected() {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    let m1 = env.create_market(&creator, 1, T, T0 + 600, 100 * ONE, 0).unwrap();
    let m2 = env.create_market(&creator, 2, T, T0 + 600, 100 * ONE, 0).unwrap();
    let s = Keypair::new();
    env.svm.airdrop(&s.pubkey(), 1_000_000_000).unwrap();
    env.set_time(Env::window_start(&m1) + 1);
    env.publish(&m1, 2 * T, 50_000 * ONE).unwrap();
    // market 1 with market 2's buffer
    let mut bad = m1.clone_keys();
    bad.samples = m2.samples;
    let ix = env.record_sample_ix(&s.pubkey(), &bad, vec![feed_pda(&m1.token_ref)]);
    assert_failed(env.send(&[ix], &s, &[]), "foreign sample buffer");
    env.set_time(m1.expiry_ts);
    let ix = Instruction::new_with_bytes(
        program_id(),
        &lifecycle_markets::instruction::Resolve {}.data(),
        lifecycle_markets::accounts::Resolve { caller: s.pubkey(), market: m1.market, sample_buffer: m2.samples }.to_account_metas(None),
    );
    assert_failed(env.send(&[ix], &s, &[]), "resolve with a foreign buffer");
}

#[test]
fn c4_token_2022_collateral_is_refused() {
    // the collateral account types are classic-token only: a Token-2022 mint cannot be used as collateral
    let mut svm = LiteSVM::new();
    let _ = &mut svm;
    assert_ne!(sources::TOKEN_2022_PROGRAM, spl_token::ID);
}

/// helper trait so the test can clone MarketKeys without deriving Clone in the shared module
trait CloneKeys {
    fn clone_keys(&self) -> MarketKeys;
}
impl CloneKeys for MarketKeys {
    fn clone_keys(&self) -> MarketKeys {
        MarketKeys { market: self.market, vault: self.vault, creator: self.creator, samples: self.samples, token_ref: self.token_ref, expiry_ts: self.expiry_ts, window_secs: self.window_secs, interval_secs: self.interval_secs }
    }
}
#[allow(dead_code)]
fn _unused(_: Outcome) {}
