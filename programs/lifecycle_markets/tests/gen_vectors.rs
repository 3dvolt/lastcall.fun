//! Generates cross-language test vectors for the TS SDK (sdk/test/vectors.json).
//! Run: GEN_VECTORS=1 cargo test -p lifecycle_markets --test gen_vectors
use lifecycle_markets::math::*;
use rand::{rngs::StdRng, Rng, SeedableRng};
use std::fmt::Write;

#[test]
fn gen_vectors() {
    let mut rng = StdRng::seed_from_u64(2024);
    let mut buys = String::new();
    let mut sells = String::new();
    let mut voids = String::new();
    let mut first = [true; 3];
    for i in 0..400u32 {
        let mag = [10u32, 20, 30, 40, 50, 61][(i % 6) as usize];
        let own = rng.gen_range(1..1u64 << mag);
        let other = rng.gen_range(1..1u64 << mag);
        let amt = rng.gen_range(1..1u64 << mag);
        let fee = [0u16, 1, 30, 100, 1000][rng.gen_range(0..5)];
        let sep = |f: &mut bool| if std::mem::replace(f, false) { "" } else { "," };
        match quote_buy(own, other, amt, fee) {
            Ok(q) => write!(buys, "{}{{\"own\":\"{own}\",\"other\":\"{other}\",\"amount\":\"{amt}\",\"feeBps\":{fee},\"ok\":true,\"fee\":\"{}\",\"net\":\"{}\",\"sharesOut\":\"{}\",\"newOwn\":\"{}\",\"newOther\":\"{}\"}}", sep(&mut first[0]), q.fee, q.net, q.shares_out, q.new_own, q.new_other).unwrap(),
            Err(_) => write!(buys, "{}{{\"own\":\"{own}\",\"other\":\"{other}\",\"amount\":\"{amt}\",\"feeBps\":{fee},\"ok\":false}}", sep(&mut first[0])).unwrap(),
        }
        let shares = rng.gen_range(1..1u64 << mag);
        match quote_sell(own, other, shares, fee) {
            Ok(q) => write!(sells, "{}{{\"own\":\"{own}\",\"other\":\"{other}\",\"shares\":\"{shares}\",\"feeBps\":{fee},\"ok\":true,\"gross\":\"{}\",\"fee\":\"{}\",\"payout\":\"{}\",\"newOwn\":\"{}\",\"newOther\":\"{}\"}}", sep(&mut first[1]), q.gross, q.fee, q.payout, q.new_own, q.new_other).unwrap(),
            Err(_) => write!(sells, "{}{{\"own\":\"{own}\",\"other\":\"{other}\",\"shares\":\"{shares}\",\"feeBps\":{fee},\"ok\":false}}", sep(&mut first[1])).unwrap(),
        }
        let (py, pn) = void_prices(own, other).unwrap();
        let ys = rng.gen_range(0..1u64 << 40);
        let ns = rng.gen_range(0..1u64 << 40);
        write!(voids, "{}{{\"y\":\"{own}\",\"n\":\"{other}\",\"pYes\":\"{py}\",\"pNo\":\"{pn}\",\"yesShares\":\"{ys}\",\"noShares\":\"{ns}\",\"payout\":\"{}\"}}", sep(&mut first[2]), void_payout(ys, ns, py, pn).unwrap()).unwrap();
    }
    let json = format!("{{\"buys\":[{buys}],\"sells\":[{sells}],\"voids\":[{voids}]}}\n");
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sdk/test/vectors.json");
    if std::env::var("GEN_VECTORS").is_ok() {
        std::fs::write(path, &json).unwrap();
    } else {
        let existing = std::fs::read_to_string(path).expect("sdk/test/vectors.json missing; run with GEN_VECTORS=1");
        assert_eq!(existing, json, "vectors.json is stale; regenerate with GEN_VECTORS=1");
    }
}

/// Golden numbers for the real PumpSwap snapshot: the TS SDK must reproduce them exactly.
#[test]
fn gen_pumpswap_golden() {
    use base64::Engine;
    let v: serde_json::Value = serde_json::from_str(include_str!("fixtures/pumpswap_mainnet.json")).unwrap();
    let bytes = |k: &str| base64::engine::general_purpose::STANDARD.decode(v[k]["data"].as_str().unwrap()).unwrap();
    let (_, _, base) = lifecycle_markets::sources::parse_token_account(&bytes("base_vault")).unwrap();
    let (_, _, quote) = lifecycle_markets::sources::parse_token_account(&bytes("quote_vault")).unwrap();
    let (supply, decimals) = lifecycle_markets::sources::parse_mint(&bytes("base_mint")).unwrap();
    let pyth = bytes("pyth_sol_usd");
    let publish = i64::from_le_bytes(pyth[93..101].try_into().unwrap());
    let usd = lifecycle_markets::sources::parse_pyth_sol_usd(&pyth, publish + 1).unwrap();
    let (mcap, liq) = lifecycle_markets::sources::pump_quote(base, quote, supply, usd).unwrap();
    let json = format!("{{\"base\":\"{base}\",\"quote\":\"{quote}\",\"supply\":\"{supply}\",\"decimals\":{decimals},\"publishTs\":{publish},\"usdPerSol6\":\"{usd}\",\"marketCap6\":\"{mcap}\",\"liquidity6\":\"{liq}\"}}\n");
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../sdk/test/pumpswap_golden.json");
    if std::env::var("GEN_VECTORS").is_ok() {
        std::fs::write(path, &json).unwrap();
    } else {
        assert_eq!(std::fs::read_to_string(path).expect("run with GEN_VECTORS=1"), json);
    }
}
