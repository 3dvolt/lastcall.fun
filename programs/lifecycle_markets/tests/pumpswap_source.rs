//! The PRODUCTION price source, tested against a REAL mainnet snapshot (tests/fixtures/pumpswap_mainnet.json):
//! a PumpSwap pool, its two vaults (one is Token-2022), the token mint and the Pyth SOL/USD account.
//! The program prices the token from those accounts alone. The "attacks" below edit the pool's reserves to
//! simulate a pump or a liquidity drain, exactly what a trader could do on mainnet.
mod common;
use anchor_lang::prelude::Pubkey;
use base64::Engine;
use common::*;
use lifecycle_markets::{error::MarketError, sources, MarketStatus, SourceKind};
use litesvm::LiteSVM;
use solana_account::Account;
use solana_keypair::Keypair;
use solana_signer::Signer;

/// the contract's minimum liquidity requirement ($5,000)
const FLOOR: u64 = 5_000 * ONE;

struct Fx {
    pool: Pubkey,
    base_vault: Pubkey,
    quote_vault: Pubkey,
    mint: Pubkey,
    pyth: Pubkey,
    publish_ts: i64,
    base_reserve: u64,
    quote_reserve: u64,
    supply: u64,
    usd_per_sol: u64,
}

fn account(v: &serde_json::Value, k: &str) -> (Pubkey, Account) {
    let e = &v[k];
    let data = base64::engine::general_purpose::STANDARD.decode(e["data"].as_str().unwrap()).unwrap();
    (
        e["address"].as_str().unwrap().parse().unwrap(),
        Account { lamports: e["lamports"].as_u64().unwrap(), data, owner: e["owner"].as_str().unwrap().parse().unwrap(), executable: false, rent_epoch: 0 },
    )
}

fn load(svm: &mut LiteSVM) -> Fx {
    let v: serde_json::Value = serde_json::from_str(include_str!("fixtures/pumpswap_mainnet.json")).unwrap();
    let mut keys = vec![];
    for k in ["pool", "base_vault", "quote_vault", "base_mint", "pyth_sol_usd"] {
        let (key, acc) = account(&v, k);
        svm.set_account(key, acc).unwrap();
        keys.push(key);
    }
    let get = |k: &str| account(&v, k).1.data;
    let publish_ts = i64::from_le_bytes(get("pyth_sol_usd")[93..101].try_into().unwrap());
    let (_, _, base_reserve) = sources::parse_token_account(&get("base_vault")).unwrap();
    let (_, _, quote_reserve) = sources::parse_token_account(&get("quote_vault")).unwrap();
    let (supply, _) = sources::parse_mint(&get("base_mint")).unwrap();
    let usd_per_sol = sources::parse_pyth_sol_usd(&get("pyth_sol_usd"), publish_ts).unwrap();
    Fx { pool: keys[0], base_vault: keys[1], quote_vault: keys[2], mint: keys[3], pyth: keys[4], publish_ts, base_reserve, quote_reserve, supply, usd_per_sol }
}

/// overwrite the token amount (offset 64) of an account in the VM
fn set_amount(svm: &mut LiteSVM, key: &Pubkey, amount: u64) {
    let mut a = svm.get_account(key).unwrap();
    a.data[64..72].copy_from_slice(&amount.to_le_bytes());
    svm.set_account(*key, a).unwrap();
}

struct Setup {
    env: Env,
    fx: Fx,
    m: MarketKeys,
    sampler: Keypair,
    start: i64,
}

fn setup(min_liquidity_usd: u64, threshold: u64) -> Setup {
    let mut env = Env::new();
    let fx = load(&mut env.svm);
    let creator = env.new_user(10_000 * ONE);
    // the clock sits just after the Pyth update; the 120 s window starts 20 s later
    let start = fx.publish_ts + 20;
    env.set_time(start - 100);
    let cfg = Cfg { threshold, min_liquidity: min_liquidity_usd, source: SourceKind::PumpSwap, token_ref: Some(fx.mint), source_account: Some(fx.pool), ..Cfg::default() };
    let m = env.create_market_cfg(&creator, 1, start + 120, 500 * ONE, 0, cfg).unwrap();
    let sampler = Keypair::new();
    env.svm.airdrop(&sampler.pubkey(), 1_000_000_000).unwrap();
    Setup { env, fx, m, sampler, start }
}

impl Setup {
    fn accounts(&self) -> Vec<Pubkey> {
        vec![self.fx.pool, self.fx.base_vault, self.fx.quote_vault, self.fx.mint, self.fx.pyth]
    }
    fn sample(&mut self, remaining: Vec<Pubkey>) -> Result<(), litesvm::types::FailedTransactionMetadata> {
        let ix = self.env.record_sample_ix(&self.sampler.pubkey(), &self.m, remaining);
        let kp = Keypair::try_from(self.sampler.to_bytes().as_slice()).unwrap();
        self.env.send(&[ix], &kp, &[])
    }
    fn at_slot(&mut self, k: i64) {
        self.env.set_time(self.start + k * 10 + 1);
    }
}

#[test]
fn the_contract_prices_a_real_pumpswap_token_on_its_own() {
    let mut s = setup(FLOOR, 1);
    s.at_slot(0);
    s.sample(s.accounts()).unwrap();
    let b = s.env.sample_buffer(&s.m);
    let (mcap, liq) = sources::pump_quote(s.fx.base_reserve, s.fx.quote_reserve, s.fx.supply, s.fx.usd_per_sol).unwrap();
    assert_eq!((b.mcap[0], b.liquidity[0]), (mcap, liq), "on-chain sample == pure computation from the real accounts");
    assert!(mcap > 10_000 * ONE && mcap < 100_000_000 * ONE, "market cap ${} is plausible", mcap / ONE);
    println!("real pool: market cap ${} liquidity ${} (SOL/USD ${})", mcap / ONE, liq / ONE, s.fx.usd_per_sol / ONE);
}

#[test]
fn a_real_token_that_holds_its_cap_resolves_yes_with_no_resolver_and_no_publisher() {
    let mut s = setup(FLOOR, 1); // threshold $0.000001: the real cap is far above it
    for k in 0..12 {
        s.at_slot(k);
        s.sample(s.accounts()).unwrap();
    }
    s.env.set_time(s.m.expiry_ts);
    let anyone = Keypair::new();
    s.env.svm.airdrop(&anyone.pubkey(), 1_000_000_000).unwrap();
    s.env.resolve_by(&anyone, &s.m).unwrap();
    let mk = s.env.market(&s.m.market);
    assert_eq!(mk.status, MarketStatus::ResolvedYes);
    assert_eq!((mk.res_samples, mk.res_above), (12, 12));
}

#[test]
fn a_pump_in_the_last_slots_is_visible_on_chain_and_does_not_win() {
    // measure the real market cap first, then set the threshold 1.5x above it
    let (mcap, _) = {
        let mut e = Env::new();
        let f = load(&mut e.svm);
        sources::pump_quote(f.base_reserve, f.quote_reserve, f.supply, f.usd_per_sol).unwrap()
    };
    let mut s = setup(FLOOR, mcap + mcap / 2);
    for k in 0..12 {
        s.at_slot(k);
        if k >= 10 {
            // a trader buys the token so the pool holds 4x the SOL (the price pumps) for the last two slots only
            set_amount(&mut s.env.svm, &s.fx.quote_vault, s.fx.quote_reserve * 4);
        }
        s.sample(s.accounts()).unwrap();
    }
    s.env.set_time(s.m.expiry_ts);
    s.env.resolve(&s.m).unwrap();
    let mk = s.env.market(&s.m.market);
    assert_eq!(mk.status, MarketStatus::ResolvedNo, "pumped in the last 2 of 12 slots: not sustained");
    assert_eq!(mk.res_above, 2);
}

#[test]
fn thin_pool_liquidity_voids_the_market() {
    let (_, liq) = {
        let mut e = Env::new();
        let f = load(&mut e.svm);
        sources::pump_quote(f.base_reserve, f.quote_reserve, f.supply, f.usd_per_sol).unwrap()
    };
    // the market demands twice the pool's real liquidity: the pool is "too thin", whatever the price does
    let mut s = setup(liq * 2, 1);
    for k in 0..12 {
        s.at_slot(k);
        s.sample(s.accounts()).unwrap();
    }
    s.env.set_time(s.m.expiry_ts);
    s.env.resolve(&s.m).unwrap();
    assert_eq!(s.env.market(&s.m.market).status, MarketStatus::Void);
}

#[test]
fn every_account_is_verified_against_what_the_market_registered() {
    let mut s = setup(FLOOR, 1);
    s.at_slot(0);
    let good = s.accounts();
    let other = Pubkey::new_unique();

    // wrong pool / vaults / mint / oracle: all rejected
    for (i, expect) in [(0, MarketError::InvalidSource), (1, MarketError::InvalidSource), (2, MarketError::InvalidSource), (3, MarketError::InvalidSource), (4, MarketError::InvalidOracle)] {
        let mut a = good.clone();
        a[i] = other;
        assert_market_err(s.sample(a), expect);
    }
    // missing accounts
    assert_market_err(s.sample(good[..4].to_vec()), MarketError::InvalidSource);
    // swapping the two vaults (a classic trick to invert the price) is rejected
    let mut swapped = good.clone();
    swapped.swap(1, 2);
    assert_market_err(s.sample(swapped), MarketError::InvalidSource);
    // a fake pool: same bytes but owned by another program is not a PumpSwap pool
    let mut fake = s.env.svm.get_account(&s.fx.pool).unwrap();
    fake.owner = Pubkey::new_unique();
    s.env.svm.set_account(s.fx.pool, fake).unwrap();
    assert_market_err(s.sample(good.clone()), MarketError::InvalidSource);
}

#[test]
fn a_stale_pyth_price_is_refused() {
    let mut s = setup(FLOOR, 1);
    // build a market whose window opens 400 s after the Pyth update (the oracle may be at most 300 s old)
    let late = s.fx.publish_ts + 400;
    s.env.set_time(late);
    let creator = s.env.new_user(10_000 * ONE);
    let cfg = Cfg { threshold: 1, min_liquidity: FLOOR, source: SourceKind::PumpSwap, token_ref: Some(s.fx.mint), source_account: Some(s.fx.pool), ..Cfg::default() };
    let m = s.env.create_market_cfg(&creator, 2, late + 130, 100 * ONE, 0, cfg).unwrap();
    s.env.set_time(Env::window_start(&m) + 1);
    s.m = m;
    assert_market_err(s.sample(s.accounts()), MarketError::StaleFeed);
}

#[test]
fn token_2022_vaults_and_mints_are_accepted() {
    // the real base vault / mint in the fixture are Token-2022 accounts, and sampling works
    let mut s = setup(FLOOR, 1);
    let base_owner = s.env.svm.get_account(&s.fx.base_vault).unwrap().owner;
    assert_eq!(base_owner, sources::TOKEN_2022_PROGRAM);
    s.at_slot(0);
    s.sample(s.accounts()).unwrap();
}
