//! Runs only against the PRODUCTION build (no `demo-feed` feature):
//!   bash scripts/build.sh prod && LIFECYCLE_SO=target/deploy-prod/lifecycle_markets.so cargo test -p lifecycle_markets --test prod_build
//! It proves the test-only price source cannot be used on the real program.
mod common;
use common::*;
use lifecycle_markets::error::MarketError;
use solana_keypair::Keypair;

#[test]
fn demo_feed_is_disabled_in_the_production_build() {
    if std::env::var("LIFECYCLE_SO").is_err() {
        eprintln!("skipped: set LIFECYCLE_SO to the production .so");
        return;
    }
    let mut env = Env::new();
    let creator = env.new_user(10_000 * ONE);
    // a market cannot be created with the demo feed as its price source ...
    assert_market_err(env.create_market(&creator, 1, 1_000_000 * ONE, T0 + 600, 100 * ONE, 0), MarketError::DemoDisabled);
    // ... and the feed-writing instruction is inert
    let kp = Keypair::new();
    env.svm.airdrop(&solana_signer::Signer::pubkey(&kp), 1_000_000_000).unwrap();
    assert_market_err(env.set_feed(&kp, anchor_lang::prelude::Pubkey::new_unique(), 1, 1, 1), MarketError::DemoDisabled);
}
