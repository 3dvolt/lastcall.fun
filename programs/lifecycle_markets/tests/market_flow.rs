mod common;
use common::*;
use lifecycle_markets::{error::MarketError, math, MarketStatus, Outcome, Side};
use solana_keypair::Keypair;
use solana_signer::Signer;

const THRESHOLD: u64 = 1_000_000 * ONE;

fn setup(fee_bps: u16) -> (Env, User, MarketKeys) {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    let m = env.create_market(&creator, 1, THRESHOLD, T0 + 600, 1_000 * ONE, fee_bps).unwrap();
    (env, creator, m)
}

#[test]
fn create_market_initial_state() {
    let (env, creator, m) = setup(100);
    let mk = env.market(&m.market);
    assert_eq!(mk.creator, creator.kp.pubkey());
    assert_eq!((mk.yes_reserve, mk.no_reserve, mk.total_minted), (1_000 * ONE, 1_000 * ONE, 1_000 * ONE));
    assert_eq!(mk.status, MarketStatus::Open);
    assert_eq!(mk.resolver, env.resolver.pubkey());
    assert_eq!(env.token_balance(&m.vault), 1_000 * ONE);
    assert_eq!(env.token_balance(&creator.ata), 9_000 * ONE);
}

#[test]
fn create_market_validation() {
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    assert_market_err(env.create_market(&creator, 1, THRESHOLD, T0, 100 * ONE, 0), MarketError::InvalidExpiry);
    assert_market_err(env.create_market(&creator, 2, THRESHOLD, T0 + 10, 100 * ONE, 1_001), MarketError::FeeTooHigh);
    assert_market_err(env.create_market(&creator, 3, 0, T0 + 10, 100 * ONE, 0), MarketError::InvalidParameter);
    assert_market_err(env.create_market(&creator, 4, THRESHOLD, T0 + 10, 0, 0), MarketError::ZeroAmount);
}

#[test]
fn buy_matches_quote_and_accounting() {
    let (mut env, _c, m) = setup(100);
    let u = env.new_user(1_000 * ONE);
    let a = 100 * ONE;
    let q = math::quote_buy(1_000 * ONE, 1_000 * ONE, a, 100).unwrap();
    env.buy(&u, &m, Side::Yes, a, q.shares_out).unwrap();
    let mk = env.market(&m.market);
    assert_eq!((mk.yes_reserve, mk.no_reserve), (q.new_own, q.new_other));
    assert_eq!(mk.total_minted, 1_000 * ONE + q.net);
    assert_eq!(mk.fees_accrued, q.fee);
    assert_eq!(env.token_balance(&m.vault), mk.total_minted + mk.fees_accrued);
    assert_eq!(env.position(&m.market, &u.kp.pubkey()).unwrap().yes_shares, q.shares_out);
    assert_eq!(env.token_balance(&u.ata), 1_000 * ONE - a);
    // Buying YES must raise the YES price: price_yes = n / (y + n)
    assert!(mk.no_reserve * 2 > (mk.yes_reserve + mk.no_reserve));
}

#[test]
fn buy_no_side_is_symmetric() {
    let (mut env, _c, m) = setup(0);
    let u = env.new_user(1_000 * ONE);
    env.buy(&u, &m, Side::No, 100 * ONE, 0).unwrap();
    let mk = env.market(&m.market);
    assert!(mk.yes_reserve > mk.no_reserve);
    let q = math::quote_buy(1_000 * ONE, 1_000 * ONE, 100 * ONE, 0).unwrap();
    assert_eq!(env.position(&m.market, &u.kp.pubkey()).unwrap().no_shares, q.shares_out);
    assert_eq!((mk.no_reserve, mk.yes_reserve), (q.new_own, q.new_other));
}

#[test]
fn buy_slippage_fails() {
    let (mut env, _c, m) = setup(0);
    let u = env.new_user(1_000 * ONE);
    let q = math::quote_buy(1_000 * ONE, 1_000 * ONE, 100 * ONE, 0).unwrap();
    assert_market_err(env.buy(&u, &m, Side::Yes, 100 * ONE, q.shares_out + 1), MarketError::SlippageExceeded);
    assert_eq!(env.token_balance(&u.ata), 1_000 * ONE, "failed tx must not move funds");
}

#[test]
fn trading_closed_after_expiry() {
    let (mut env, _c, m) = setup(0);
    let u = env.new_user(1_000 * ONE);
    env.buy(&u, &m, Side::Yes, 10 * ONE, 0).unwrap();
    env.set_time(T0 + 600);
    assert_market_err(env.buy(&u, &m, Side::Yes, 10 * ONE, 0), MarketError::TradingClosed);
    assert_market_err(env.sell(&u, &m, Side::Yes, 1, 0), MarketError::TradingClosed);
}

#[test]
fn sell_matches_quote() {
    let (mut env, _c, m) = setup(100);
    let u = env.new_user(1_000 * ONE);
    env.buy(&u, &m, Side::Yes, 100 * ONE, 0).unwrap();
    let mk = env.market(&m.market);
    let shares = env.position(&m.market, &u.kp.pubkey()).unwrap().yes_shares;
    let bal = env.token_balance(&u.ata);
    let q = math::quote_sell(mk.yes_reserve, mk.no_reserve, shares / 2, 100).unwrap();
    assert_market_err(env.sell(&u, &m, Side::Yes, shares / 2, q.payout + 1), MarketError::SlippageExceeded);
    env.sell(&u, &m, Side::Yes, shares / 2, q.payout).unwrap();
    assert_eq!(env.token_balance(&u.ata), bal + q.payout);
    let mk2 = env.market(&m.market);
    assert_eq!((mk2.yes_reserve, mk2.no_reserve), (q.new_own, q.new_other));
    assert_eq!(env.token_balance(&m.vault), mk2.total_minted + mk2.fees_accrued);
    assert_market_err(env.sell(&u, &m, Side::Yes, shares, 0), MarketError::InsufficientShares);
    assert_market_err(env.sell(&u, &m, Side::No, 1, 0), MarketError::InsufficientShares);
}

#[test]
fn round_trip_loses_at_most_fees() {
    for fee_bps in [0u16, 30, 100, 500] {
        let (mut env, _c, m) = setup(fee_bps);
        let u = env.new_user(1_000 * ONE);
        for side in [Side::Yes, Side::No] {
            for a in [1 * ONE, 37 * ONE + 123, 400 * ONE] {
                let before = env.token_balance(&u.ata);
                env.buy(&u, &m, side, a, 0).unwrap();
                let p = env.position(&m.market, &u.kp.pubkey()).unwrap();
                let shares = if side == Side::Yes { p.yes_shares } else { p.no_shares };
                env.sell(&u, &m, side, shares, 0).unwrap();
                let after = env.token_balance(&u.ata);
                assert!(after <= before, "never profit from a round trip (fee {fee_bps}, a {a})");
                // loss bound: buy fee (ceil) + sell fee on gross (<= ceil(a * bps/1e4) + 1 as gross <= a) + 2 rounding units
                let buy_fee = math::fee_of(a, fee_bps).unwrap();
                let sell_fee_bound = math::fee_of(a, fee_bps).unwrap();
                assert!(before - after <= buy_fee + sell_fee_bound + 2, "loss {} fee_bps {fee_bps} a {a}", before - after);
            }
        }
    }
}

#[test]
fn resolve_rules() {
    let (mut env, creator, m) = setup(0);
    // before expiry
    assert_market_err(env.resolve(&m, Outcome::Yes), MarketError::NotExpired);
    env.set_time(T0 + 600);
    // unauthorized
    let rando = Keypair::new();
    env.svm.airdrop(&rando.pubkey(), 1_000_000_000).unwrap();
    assert_market_err(env.resolve_as(&rando, &m, Outcome::Yes, [0; 32]), MarketError::UnauthorizedResolver);
    // creator is not resolver either
    let kp = Keypair::try_from(creator.kp.to_bytes().as_slice()).unwrap();
    assert_market_err(env.resolve_as(&kp, &m, Outcome::Yes, [0; 32]), MarketError::UnauthorizedResolver);
    env.resolve(&m, Outcome::No).unwrap();
    let mk = env.market(&m.market);
    assert_eq!(mk.status, MarketStatus::ResolvedNo);
    assert_eq!(mk.evidence_hash, [7u8; 32]);
    assert_market_err(env.resolve(&m, Outcome::Yes), MarketError::MarketNotOpen);
}

#[test]
fn redeem_yes_and_double_redeem_and_residual() {
    let (mut env, creator, m) = setup(100);
    let winner = env.new_user(1_000 * ONE);
    let loser = env.new_user(1_000 * ONE);
    env.buy(&winner, &m, Side::Yes, 200 * ONE, 0).unwrap();
    env.buy(&loser, &m, Side::No, 150 * ONE, 0).unwrap();
    assert_market_err(env.redeem(&winner, &m), MarketError::NotResolved);
    assert_market_err(env.claim_residual(&creator, &m), MarketError::NotResolved);

    env.set_time(T0 + 600);
    env.resolve(&m, Outcome::Yes).unwrap();
    let mk = env.market(&m.market);
    let wshares = env.position(&m.market, &winner.kp.pubkey()).unwrap().yes_shares;
    assert_eq!(mk.user_obligation, mk.total_minted - mk.yes_reserve);

    let wb = env.token_balance(&winner.ata);
    env.redeem(&winner, &m).unwrap();
    assert_eq!(env.token_balance(&winner.ata), wb + wshares);
    assert_market_err(env.redeem(&winner, &m), MarketError::AlreadyRedeemed);

    let lb = env.token_balance(&loser.ata);
    env.redeem(&loser, &m).unwrap();
    assert_eq!(env.token_balance(&loser.ata), lb, "losing shares pay 0");

    // only creator can claim; only once
    assert_market_err(env.claim_residual(&winner, &m), MarketError::UnauthorizedCreator);
    let cb = env.token_balance(&creator.ata);
    env.claim_residual(&creator, &m).unwrap();
    assert_eq!(env.token_balance(&creator.ata), cb + mk.yes_reserve + mk.fees_accrued);
    assert_market_err(env.claim_residual(&creator, &m), MarketError::AlreadyClaimed);
    assert_eq!(env.token_balance(&m.vault), 0, "vault must be fully drained, exactly");
}

#[test]
fn void_path_solvent() {
    let (mut env, creator, m) = setup(100);
    let a = env.new_user(1_000 * ONE);
    let b = env.new_user(1_000 * ONE);
    env.buy(&a, &m, Side::Yes, 300 * ONE, 0).unwrap();
    env.buy(&b, &m, Side::No, 120 * ONE, 0).unwrap();
    env.set_time(T0 + 600);
    env.resolve(&m, Outcome::Void).unwrap();
    let mk = env.market(&m.market);
    assert_eq!(mk.status, MarketStatus::Void);
    let (py, pn) = math::void_prices(mk.yes_reserve, mk.no_reserve).unwrap();
    assert_eq!((mk.void_yes_price, mk.void_no_price), (py, pn));

    let pa = env.position(&m.market, &a.kp.pubkey()).unwrap();
    let ab = env.token_balance(&a.ata);
    env.redeem(&a, &m).unwrap();
    assert_eq!(env.token_balance(&a.ata), ab + math::void_payout(pa.yes_shares, pa.no_shares, py, pn).unwrap());
    env.redeem(&b, &m).unwrap();
    env.claim_residual(&creator, &m).unwrap();
    let dust = env.token_balance(&m.vault);
    assert!(dust <= 4, "Void dust should be only rounding, got {dust}");
    assert_market_err(env.redeem(&a, &m), MarketError::AlreadyRedeemed);
}

#[test]
fn demo_feed_authority() {
    let mut env = Env::new();
    let auth = Keypair::new();
    env.svm.airdrop(&auth.pubkey(), 1_000_000_000).unwrap();
    let other = Keypair::new();
    env.svm.airdrop(&other.pubkey(), 1_000_000_000).unwrap();
    let token_ref = anchor_lang::prelude::Pubkey::new_unique();
    env.set_feed(&auth, token_ref, 5_000, 1_000_000, 20_000 * ONE).unwrap();
    env.set_feed(&auth, token_ref, 6_000, 1_000_000, 20_000 * ONE).unwrap();
    assert_market_err(env.set_feed(&other, token_ref, 9_999, 1, 1), MarketError::UnauthorizedFeedAuthority);
    use anchor_lang::AccountDeserialize;
    let acc = env.svm.get_account(&feed_pda(&token_ref)).unwrap();
    let feed = lifecycle_markets::DemoFeed::try_deserialize(&mut &acc.data[..]).unwrap();
    assert_eq!((feed.price, feed.authority), (6_000, auth.pubkey()));
}
