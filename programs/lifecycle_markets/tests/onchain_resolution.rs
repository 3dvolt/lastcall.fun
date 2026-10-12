//! The on-chain resolution machinery with the (test-only) demo feed as price source:
//! sample slots, permissionless resolve, the rule applied by the program, and the standalone-transaction guard.
mod common;
use anchor_lang::solana_program::{instruction::Instruction, system_instruction};
use common::*;
use lifecycle_markets::{error::MarketError, MarketStatus, Outcome, SourceKind};
use solana_keypair::Keypair;
use solana_signer::Signer;

const T: u64 = 1_000_000 * ONE;
const LIQ: u64 = 50_000 * ONE;

fn setup() -> (Env, User, MarketKeys, Keypair) {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    let m = env.create_market(&creator, 1, T, T0 + 600, 1_000 * ONE, 0).unwrap();
    let sampler = Keypair::new();
    env.svm.airdrop(&sampler.pubkey(), 1_000_000_000).unwrap();
    (env, creator, m, sampler)
}

#[test]
fn sampling_only_inside_the_window_and_one_sample_per_slot() {
    let (mut env, _c, m, s) = setup();
    let ws = Env::window_start(&m);
    env.set_time(ws - 1);
    env.publish(&m, 2 * T, LIQ).unwrap();
    assert_market_err(env.record_sample(&s, &m), MarketError::OutsideWindow);

    env.set_time(ws + 1); // slot 0
    env.publish(&m, 2 * T, LIQ).unwrap();
    env.record_sample(&s, &m).unwrap();
    assert_market_err(env.record_sample(&s, &m), MarketError::SlotAlreadyFilled);
    env.set_time(ws + 9); // still slot 0
    env.publish(&m, 5 * T, LIQ).unwrap();
    assert_market_err(env.record_sample(&s, &m), MarketError::SlotAlreadyFilled);

    env.set_time(ws + 10); // slot 1
    env.publish(&m, 2 * T, LIQ).unwrap();
    env.record_sample(&s, &m).unwrap();
    let b = env.sample_buffer(&m);
    assert_eq!(b.count, 2);
    assert!(b.filled[0] && b.filled[1] && !b.filled[2]);
    assert_eq!(b.mcap[0], 2 * T, "the FIRST sample of a slot wins, later ones cannot overwrite it");

    env.set_time(m.expiry_ts); // window is over
    env.publish(&m, 2 * T, LIQ).unwrap();
    assert_market_err(env.record_sample(&s, &m), MarketError::OutsideWindow);
}

#[test]
fn a_stale_feed_cannot_be_sampled() {
    let (mut env, _c, m, s) = setup();
    let ws = Env::window_start(&m);
    env.set_time(ws + 1);
    env.publish(&m, 2 * T, LIQ).unwrap();
    env.set_time(ws + 1 + 61); // the feed is now older than 60 s
    assert_market_err(env.record_sample(&s, &m), MarketError::StaleFeed);
}

#[test]
fn only_the_registered_feed_and_publisher_count() {
    let (mut env, creator, m, s) = setup();
    let ws = Env::window_start(&m);
    env.set_time(ws + 1);
    // a feed for ANOTHER token cannot stand in for this market's feed
    let other = anchor_lang::prelude::Pubkey::new_unique();
    let kp = Keypair::try_from(env.publisher.to_bytes().as_slice()).unwrap();
    env.set_feed(&kp, other, 9 * T, 1, LIQ).unwrap();
    let ix = env.record_sample_ix(&s.pubkey(), &m, vec![feed_pda(&other)]);
    assert_market_err(env.send(&[ix], &s, &[]), MarketError::InvalidSource);

    // a market whose registered publisher is NOT the one who first wrote the feed rejects the data
    let evil = Keypair::new();
    env.svm.airdrop(&evil.pubkey(), 1_000_000_000).unwrap();
    let token = anchor_lang::prelude::Pubkey::new_unique();
    env.set_feed(&evil, token, 9 * T, 1, LIQ).unwrap(); // evil squats the feed first
    let expiry2 = env.now() + 600; // clock is already inside market 1's window
    let m2 = env.create_market_cfg(&creator, 2, expiry2, 100 * ONE, 0, Cfg { token_ref: Some(token), ..Cfg::default() }).unwrap();
    env.set_time(Env::window_start(&m2) + 1);
    env.set_feed(&evil, token, 9 * T, 1, LIQ).unwrap();
    assert_market_err(env.record_sample(&s, &m2), MarketError::InvalidOracle);
}

#[test]
fn the_outcome_is_computed_on_chain_and_anyone_can_resolve() {
    for (outcome, expect) in [(Outcome::Yes, MarketStatus::ResolvedYes), (Outcome::No, MarketStatus::ResolvedNo), (Outcome::Void, MarketStatus::Void)] {
        let (mut env, _c, m, _s) = setup();
        assert_market_err(env.resolve(&m), MarketError::NotExpired);
        env.settle(&m, outcome).unwrap(); // the resolver wallet here is a random funded wallet (no special key)
        let mk = env.market(&m.market);
        assert_eq!(mk.status, expect);
        assert_market_err(env.resolve(&m), MarketError::MarketNotOpen);
        if outcome != Outcome::Void {
            assert_eq!(mk.res_samples as usize, Env::slots(&m));
            assert!(mk.res_liq_median >= mk.min_liquidity_usd);
        } else {
            assert_eq!(mk.res_samples, 0);
        }
    }
}

#[test]
fn pump_and_dump_in_the_last_slots_resolves_no() {
    let (mut env, _c, m, _s) = setup();
    let n = Env::slots(&m);
    // honest value at 50% of the threshold, then a pump to 3x in the last two slots of the window
    let mut v = vec![Some((T / 2, LIQ)); n - 2];
    v.extend([Some((T * 3, LIQ)), Some((T * 3, LIQ))]);
    env.fill_window(&m, &v);
    env.set_time(m.expiry_ts);
    env.resolve(&m).unwrap();
    let mk = env.market(&m.market);
    assert_eq!(mk.status, MarketStatus::ResolvedNo);
    assert_eq!(mk.res_above, 2, "the spike is visible on-chain, and it does not win");
    assert!(mk.res_twap < T, "the average stays below the threshold too");
    // and even when the average alone would pass (a bigger pump), the 90%-sustained rule still says NO
    let (mut env2, _c2, m2, _s2) = setup();
    let mut v2 = vec![Some((T * 6 / 10, LIQ)); n - 2];
    v2.extend([Some((T * 10, LIQ)), Some((T * 10, LIQ))]);
    env2.fill_window(&m2, &v2);
    env2.set_time(m2.expiry_ts);
    env2.resolve(&m2).unwrap();
    let mk2 = env2.market(&m2.market);
    assert!(mk2.res_twap >= T, "average alone would say YES");
    assert_eq!(mk2.status, MarketStatus::ResolvedNo);
}

#[test]
fn thin_liquidity_and_missing_samples_resolve_void() {
    let (mut env, _c, m, _s) = setup();
    let n = Env::slots(&m);
    env.fill_window(&m, &vec![Some((2 * T, 2_000 * ONE)); n]); // above threshold but only $2k of liquidity (min $10k)
    env.set_time(m.expiry_ts);
    env.resolve(&m).unwrap();
    assert_eq!(env.market(&m.market).status, MarketStatus::Void);

    let (mut env, _c, m, _s) = setup();
    let mut v: Vec<Option<(u64, u64)>> = vec![Some((2 * T, LIQ)); 9]; // 9/12 = 75% < 80%
    v.extend([None, None, None]);
    env.fill_window(&m, &v);
    env.set_time(m.expiry_ts);
    env.resolve(&m).unwrap();
    assert_eq!(env.market(&m.market).status, MarketStatus::Void);

    let (mut env, _c, m, _s) = setup();
    let mut v: Vec<Option<(u64, u64)>> = vec![Some((2 * T, LIQ)); 10]; // 10/12 = 83% >= 80% -> counts
    v.extend([None, None]);
    env.fill_window(&m, &v);
    env.set_time(m.expiry_ts);
    env.resolve(&m).unwrap();
    assert_eq!(env.market(&m.market).status, MarketStatus::ResolvedYes);
}

#[test]
fn a_sample_must_be_in_a_standalone_transaction() {
    let (mut env, _c, m, s) = setup();
    env.set_time(Env::window_start(&m) + 1);
    env.publish(&m, 2 * T, LIQ).unwrap();
    // the "pump, sample, dump" pattern needs OTHER instructions in the same transaction: rejected
    let transfer = system_instruction::transfer(&s.pubkey(), &anchor_lang::prelude::Pubkey::new_unique(), 1);
    let rec = env.record_sample_ix(&s.pubkey(), &m, vec![feed_pda(&m.token_ref)]);
    assert_market_err(env.send(&[transfer.clone(), rec.clone()], &s, &[]), MarketError::NotStandalone);
    assert_market_err(env.send(&[rec.clone(), transfer], &s, &[]), MarketError::NotStandalone);
    // alone it works; with a compute-budget instruction (priority fees) it also works
    let cb = Instruction::new_with_bytes(
        anchor_lang::prelude::Pubkey::from_str_const("ComputeBudget111111111111111111111111111111"),
        &[2, 0x40, 0x0d, 0x03, 0x00], // SetComputeUnitLimit(200_000)
        vec![],
    );
    env.send(&[cb, rec], &s, &[]).unwrap();
    assert_eq!(env.sample_buffer(&m).count, 1);
}

#[test]
fn sampling_configuration_is_validated() {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    let mut id = 100;
    let mut try_cfg = |env: &mut Env, cfg: Cfg| { id += 1; env.create_market_cfg(&creator, id, T0 + 5_000, 100 * ONE, 0, cfg) };
    assert_market_err(try_cfg(&mut env, Cfg { interval_secs: 4, ..Cfg::default() }), MarketError::InvalidSampling); // too frequent
    assert_market_err(try_cfg(&mut env, Cfg { interval_secs: 60, window_secs: 120, ..Cfg::default() }), MarketError::InvalidSampling); // 2 slots
    assert_market_err(try_cfg(&mut env, Cfg { interval_secs: 10, window_secs: 1_300, ..Cfg::default() }), MarketError::InvalidSampling); // 130 slots
    assert_market_err(try_cfg(&mut env, Cfg { min_liquidity: 4_999 * ONE, ..Cfg::default() }), MarketError::InvalidParameter); // below the $5,000 floor
    assert_market_err(try_cfg(&mut env, Cfg { oracle_authority: Some(anchor_lang::prelude::Pubkey::default()), ..Cfg::default() }), MarketError::InvalidOracle);
    // the demo feed must be the PDA of the token
    assert_market_err(try_cfg(&mut env, Cfg { source_account: Some(anchor_lang::prelude::Pubkey::new_unique()), ..Cfg::default() }), MarketError::InvalidSource);
    // a pump-swap market must point at a real PumpSwap pool
    assert_market_err(try_cfg(&mut env, Cfg { source: SourceKind::PumpSwap, source_account: Some(anchor_lang::prelude::Pubkey::new_unique()), ..Cfg::default() }), MarketError::InvalidSource);
    try_cfg(&mut env, Cfg::default()).unwrap();
}
