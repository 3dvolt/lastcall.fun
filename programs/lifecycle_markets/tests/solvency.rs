//! Randomized solvency / conservation invariants over sequences of buys, sells, resolve, redeems, residual claim.
mod common;
use common::*;
use lifecycle_markets::{MarketStatus, Outcome, Side};
use rand::{rngs::StdRng, Rng, SeedableRng};
use solana_signer::Signer;

fn check_invariants(env: &Env, m: &MarketKeys, users: &[User], k0: u128) {
    let mk = env.market(&m.market);
    assert_eq!(env.token_balance(&m.vault), mk.total_minted + mk.fees_accrued, "vault == minted + fees");
    let (mut ys, mut ns) = (0u64, 0u64);
    for u in users {
        if let Some(p) = env.position(&m.market, &u.kp.pubkey()) {
            ys += p.yes_shares;
            ns += p.no_shares;
        }
    }
    assert_eq!(ys + mk.yes_reserve, mk.total_minted, "YES conservation");
    assert_eq!(ns + mk.no_reserve, mk.total_minted, "NO conservation");
    assert!((mk.yes_reserve as u128) * (mk.no_reserve as u128) >= k0, "pool product never decreases");
    // worst-case user claim <= vault holdings
    assert!(ys.max(ns) <= env.token_balance(&m.vault), "winning shares always covered");
}

fn run(seed: u64, outcome: Outcome) {
    let mut rng = StdRng::seed_from_u64(seed);
    let mut env = Env::new();
    let fee_bps = [0u16, 30, 100, 500, 1000][rng.gen_range(0..5)];
    let liq = rng.gen_range(10..5_000u64) * ONE / 10 + rng.gen_range(1..1000);
    let creator = env.new_user(liq + ONE);
    let m = env.create_market(&creator, seed, 1_000_000, T0 + 600, liq, fee_bps).unwrap();
    let users: Vec<User> = (0..6).map(|_| env.new_user(100_000 * ONE)).collect();
    let k0 = (liq as u128) * (liq as u128);
    check_invariants(&env, &m, &users, k0);

    let (mut ok_buys, mut ok_sells) = (0u32, 0u32);
    for _ in 0..120 {
        let u = &users[rng.gen_range(0..users.len())];
        let side = if rng.gen_bool(0.5) { Side::Yes } else { Side::No };
        if rng.gen_bool(0.6) {
            let a = match rng.gen_range(0..4) {
                0 => rng.gen_range(1..100u64),
                1 => rng.gen_range(1..liq),
                2 => rng.gen_range(1..liq * 5),
                _ => rng.gen_range(1..2_000 * ONE),
            };
            ok_buys += env.buy(u, &m, side, a, 0).is_ok() as u32;
        } else if let Some(p) = env.position(&m.market, &u.kp.pubkey()) {
            let held = if side == Side::Yes { p.yes_shares } else { p.no_shares };
            if held > 0 {
                let s = if rng.gen_bool(0.3) { held } else { rng.gen_range(1..=held) };
                ok_sells += env.sell(u, &m, side, s, 0).is_ok() as u32;
            }
        }
        check_invariants(&env, &m, &users, k0);
    }

    assert!(ok_buys >= 20 && ok_sells >= 5, "test must exercise trades: buys {ok_buys} sells {ok_sells} seed {seed}");
    env.set_time(T0 + 600);
    env.resolve(&m, outcome).unwrap();
    let mk = env.market(&m.market);
    let mut owed = 0u64;
    let mut order: Vec<usize> = (0..users.len()).collect();
    // shuffle
    for i in (1..order.len()).rev() {
        order.swap(i, rng.gen_range(0..=i));
    }
    for &i in &order {
        let u = &users[i];
        if env.position(&m.market, &u.kp.pubkey()).is_none() {
            continue;
        }
        let before = env.token_balance(&u.ata);
        env.redeem(u, &m).unwrap();
        owed += env.token_balance(&u.ata) - before;
    }
    assert!(owed <= mk.user_obligation, "users never receive more than reserved obligation");
    let cb = env.token_balance(&creator.ata);
    env.claim_residual(&creator, &m).unwrap();
    let got = env.token_balance(&creator.ata) - cb;
    assert_eq!(got, mk.total_minted + mk.fees_accrued - mk.user_obligation);
    let left = env.token_balance(&m.vault);
    match mk.status {
        MarketStatus::Void => assert!(left <= 2 * users.len() as u64 + 2, "void dust {left}"),
        _ => assert_eq!(left, 0, "vault must end at exactly zero (seed {seed})"),
    }
}

#[test]
fn randomized_solvency_yes() {
    for seed in 0..25 {
        run(seed, Outcome::Yes);
    }
}
#[test]
fn randomized_solvency_no() {
    for seed in 100..125 {
        run(seed, Outcome::No);
    }
}
#[test]
fn randomized_solvency_void() {
    for seed in 200..225 {
        run(seed, Outcome::Void);
    }
}
