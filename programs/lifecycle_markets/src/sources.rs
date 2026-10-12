//! Price sources. Everything here is a pure function over raw account bytes, so it is unit-tested
//! natively against real mainnet account snapshots (tests/fixtures/pumpswap_mainnet.json).
//!
//! PumpSwap (constant-product AMM used by pump.fun graduates), quoted in SOL:
//!   price/market cap from the two pool vault balances + the mint supply + the Pyth SOL/USD price.
//! Nothing is supplied by the caller: every account is checked against the addresses registered at market creation.

use anchor_lang::prelude::*;

pub const PUMPSWAP_PROGRAM: Pubkey = pubkey!("pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA");
pub const TOKEN_PROGRAM: Pubkey = pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
pub const TOKEN_2022_PROGRAM: Pubkey = pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");
pub const WSOL_MINT: Pubkey = pubkey!("So11111111111111111111111111111111111111112");
pub const PYTH_RECEIVER_PROGRAM: Pubkey = pubkey!("rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ");
/// Pyth sponsored SOL/USD price-update account (shard 0).
pub const PYTH_SOL_USD_ACCOUNT: Pubkey = pubkey!("7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE");
pub const PYTH_SOL_USD_FEED_ID: [u8; 32] = [
    0xef, 0x0d, 0x8b, 0x6f, 0xda, 0x2c, 0xeb, 0xa4, 0x1d, 0xa1, 0x5d, 0x40, 0x95, 0xd1, 0xda, 0x39, 0x2a, 0x0d, 0x2f, 0x8e, 0xd0, 0xc6, 0xc7,
    0xbc, 0x0f, 0x4c, 0xfa, 0xc8, 0xc2, 0x80, 0xb5, 0x6d,
];
pub const PUMPSWAP_POOL_DISC: [u8; 8] = [0xf1, 0x9a, 0x6d, 0x04, 0x11, 0xb1, 0x6d, 0xbc];
pub const PYTH_PRICE_UPDATE_V2_DISC: [u8; 8] = [0x22, 0xf1, 0x23, 0x63, 0x9d, 0x7e, 0xf4, 0xcd];

/// SOL/USD must have been published at most this long ago (Pyth sponsored feeds update on deviation/heartbeat).
pub const MAX_ORACLE_AGE_SECS: i64 = 300;
/// Reject the SOL/USD price if its confidence interval exceeds 2% of the price.
pub const MAX_CONF_BPS: u64 = 200;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceError {
    BadLayout,
    WrongProgram,
    BadOracle,
    StaleOracle,
    Math,
    /// the token's issuer keeps a power that can change the computed market cap or the pool's reserves
    UnsafeMint,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PumpPool {
    pub base_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub base_vault: Pubkey,
    pub quote_vault: Pubkey,
}

fn pk(d: &[u8], off: usize) -> Pubkey {
    Pubkey::new_from_array(d[off..off + 32].try_into().unwrap())
}
fn u64_at(d: &[u8], off: usize) -> u64 {
    u64::from_le_bytes(d[off..off + 8].try_into().unwrap())
}
fn i64_at(d: &[u8], off: usize) -> i64 {
    i64::from_le_bytes(d[off..off + 8].try_into().unwrap())
}

/// PumpSwap `Pool` account: disc(8) bump(1) index(2) creator(32) base_mint@43 quote_mint@75 lp_mint@107 base_vault@139 quote_vault@171.
pub fn parse_pool(d: &[u8]) -> core::result::Result<PumpPool, SourceError> {
    if d.len() < 203 || d[..8] != PUMPSWAP_POOL_DISC {
        return Err(SourceError::BadLayout);
    }
    Ok(PumpPool { base_mint: pk(d, 43), quote_mint: pk(d, 75), base_vault: pk(d, 139), quote_vault: pk(d, 171) })
}

/// SPL token account (Token and Token-2022 share the first 165 bytes): mint@0 owner@32 amount@64.
pub fn parse_token_account(d: &[u8]) -> core::result::Result<(Pubkey, Pubkey, u64), SourceError> {
    if d.len() < 72 {
        return Err(SourceError::BadLayout);
    }
    Ok((pk(d, 0), pk(d, 32), u64_at(d, 64)))
}

/// SPL mint (Token and Token-2022): supply@36 decimals@44.
pub fn parse_mint(d: &[u8]) -> core::result::Result<(u64, u8), SourceError> {
    if d.len() < 45 {
        return Err(SourceError::BadLayout);
    }
    Ok((u64_at(d, 36), d[44]))
}

/// Token-2022 extension types an issuer could abuse to move the pool's reserves or run code on transfers.
const DANGEROUS_EXTENSIONS: [u16; 3] = [
    12, // PermanentDelegate: can burn/transfer tokens out of ANY account, including the pool vault
    14, // TransferHook: arbitrary program runs on every transfer
    26, // PausableConfig: the issuer can pause transfers
];

/// A token is only safe to price from its pool if its issuer can NOT print supply (market cap = supply x price) and holds no
/// Token-2022 power over the pool's reserves. Classic mints and Token-2022 mints are both parsed.
pub fn check_mint_safety(d: &[u8]) -> core::result::Result<(), SourceError> {
    if d.len() < 82 {
        return Err(SourceError::BadLayout);
    }
    if u32::from_le_bytes(d[0..4].try_into().unwrap()) != 0 {
        return Err(SourceError::UnsafeMint); // COption<mint_authority> must be None
    }
    if d.len() == 82 {
        return Ok(()); // classic SPL mint
    }
    if d.len() < 167 || d[165] != 1 {
        return Err(SourceError::BadLayout); // Token-2022 mint: account type byte must be Mint
    }
    let mut off = 166usize;
    while off + 4 <= d.len() {
        let t = u16::from_le_bytes([d[off], d[off + 1]]);
        let l = u16::from_le_bytes([d[off + 2], d[off + 3]]) as usize;
        if t == 0 {
            break; // zero padding after the last extension
        }
        if DANGEROUS_EXTENSIONS.contains(&t) {
            return Err(SourceError::UnsafeMint);
        }
        off = off.checked_add(4 + l).ok_or(SourceError::BadLayout)?;
        if off > d.len() {
            return Err(SourceError::BadLayout);
        }
    }
    Ok(())
}

pub fn is_token_program(k: &Pubkey) -> bool {
    *k == TOKEN_PROGRAM || *k == TOKEN_2022_PROGRAM
}

/// Pyth `PriceUpdateV2`: disc(8) write_authority(32) verification_level(1: 1 == Full) feed_id@41 price@73 conf@81 expo@89(i32) publish_time@93.
/// Returns USD per 1 SOL scaled by 1e6.
pub fn parse_pyth_sol_usd(d: &[u8], now: i64) -> core::result::Result<u64, SourceError> {
    if d.len() < 101 || d[..8] != PYTH_PRICE_UPDATE_V2_DISC {
        return Err(SourceError::BadLayout);
    }
    if d[40] != 1 || d[41..73] != PYTH_SOL_USD_FEED_ID {
        return Err(SourceError::BadOracle); // must be fully verified and be the SOL/USD feed
    }
    let price = i64_at(d, 73);
    let conf = u64_at(d, 81);
    let expo = i32::from_le_bytes(d[89..93].try_into().unwrap());
    let publish = i64_at(d, 93);
    if price <= 0 || !(-12..=0).contains(&expo) {
        return Err(SourceError::BadOracle);
    }
    if publish > now.saturating_add(10) || now.saturating_sub(publish) > MAX_ORACLE_AGE_SECS {
        return Err(SourceError::StaleOracle);
    }
    if (conf as u128) * 10_000 > (price as u128) * MAX_CONF_BPS as u128 {
        return Err(SourceError::BadOracle);
    }
    let p = price as u128;
    let shift = 6 + expo; // usd6 = price * 10^(6+expo)
    let usd6 = if shift >= 0 { p * 10u128.pow(shift as u32) } else { p / 10u128.pow((-shift) as u32) };
    u64::try_from(usd6).map_err(|_| SourceError::Math)
}

/// Market cap and liquidity in USD (6 decimals) from raw pool reserves.
///  mcap = supply_raw * (quote_lamports / base_raw) SOL-per-raw-unit * usd_per_sol      (decimals cancel out)
///  liquidity = 2 * quote side value (the usual AMM convention)
pub fn pump_quote(base_reserve: u64, quote_reserve_lamports: u64, supply_raw: u64, usd_per_sol_6: u64) -> core::result::Result<(u64, u64), SourceError> {
    if base_reserve == 0 || quote_reserve_lamports == 0 || usd_per_sol_6 == 0 {
        return Err(SourceError::Math);
    }
    let per_unit = (supply_raw as u128).checked_mul(quote_reserve_lamports as u128).ok_or(SourceError::Math)? / base_reserve as u128;
    let mcap = per_unit.checked_mul(usd_per_sol_6 as u128).ok_or(SourceError::Math)? / 1_000_000_000u128;
    let liq = (quote_reserve_lamports as u128).checked_mul(2).and_then(|x| x.checked_mul(usd_per_sol_6 as u128)).ok_or(SourceError::Math)? / 1_000_000_000u128;
    Ok((u64::try_from(mcap).map_err(|_| SourceError::Math)?, u64::try_from(liq).map_err(|_| SourceError::Math)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    fn fx() -> serde_json::Value {
        serde_json::from_str(include_str!("../tests/fixtures/pumpswap_mainnet.json")).unwrap()
    }
    fn bytes(v: &serde_json::Value, k: &str) -> Vec<u8> {
        base64::engine::general_purpose::STANDARD.decode(v[k]["data"].as_str().unwrap()).unwrap()
    }
    fn key(v: &serde_json::Value, k: &str) -> Pubkey {
        v[k]["address"].as_str().unwrap().parse().unwrap()
    }

    #[test]
    fn real_pool_parses_and_is_consistent() {
        let v = fx();
        let p = parse_pool(&bytes(&v, "pool")).unwrap();
        assert_eq!(p.base_mint, key(&v, "base_mint"));
        assert_eq!(p.quote_mint, WSOL_MINT);
        assert_eq!(p.base_vault, key(&v, "base_vault"));
        assert_eq!(p.quote_vault, key(&v, "quote_vault"));
        let (m, owner, base) = parse_token_account(&bytes(&v, "base_vault")).unwrap();
        assert_eq!((m, owner), (p.base_mint, key(&v, "pool")));
        let (qm, qo, quote) = parse_token_account(&bytes(&v, "quote_vault")).unwrap();
        assert_eq!((qm, qo), (WSOL_MINT, key(&v, "pool")));
        let (supply, dec) = parse_mint(&bytes(&v, "base_mint")).unwrap();
        assert_eq!(dec, 6);
        assert!(base > 0 && quote > 0 && supply > base);
    }

    #[test]
    fn real_token_mint_is_safe_and_attacks_are_refused() {
        let v = fx();
        let real = bytes(&v, "base_mint");
        assert_eq!(check_mint_safety(&real), Ok(()), "the real pump.fun token (no mint authority, metadata only) passes");
        let mut with_authority = real.clone();
        with_authority[0..4].copy_from_slice(&1u32.to_le_bytes());
        assert_eq!(check_mint_safety(&with_authority), Err(SourceError::UnsafeMint));
        for ext in [12u16, 14, 26] {
            let mut bad = real.clone();
            bad[166..168].copy_from_slice(&ext.to_le_bytes());
            assert_eq!(check_mint_safety(&bad), Err(SourceError::UnsafeMint), "extension {ext}");
        }
        // classic mint: 82 bytes
        let mut classic = vec![0u8; 82];
        assert_eq!(check_mint_safety(&classic), Ok(()));
        classic[0] = 1;
        assert_eq!(check_mint_safety(&classic), Err(SourceError::UnsafeMint));
        // garbage / truncated
        assert_eq!(check_mint_safety(&[0u8; 10]), Err(SourceError::BadLayout));
        let mut truncated = real.clone();
        truncated[166..168].copy_from_slice(&18u16.to_le_bytes());
        truncated[168..170].copy_from_slice(&60000u16.to_le_bytes()); // length beyond the account
        assert_eq!(check_mint_safety(&truncated), Err(SourceError::BadLayout));
    }

    #[test]
    fn real_pyth_parses() {
        let v = fx();
        let d = bytes(&v, "pyth_sol_usd");
        let publish = i64_at(&d, 93);
        let usd = parse_pyth_sol_usd(&d, publish + 5).unwrap();
        assert!((50_000_000..500_000_000).contains(&usd), "SOL/USD {usd} should be between $50 and $500");
        assert_eq!(parse_pyth_sol_usd(&d, publish + MAX_ORACLE_AGE_SECS + 1), Err(SourceError::StaleOracle));
        assert_eq!(parse_pyth_sol_usd(&d, publish - 60), Err(SourceError::StaleOracle));
        let mut wrong_feed = d.clone();
        wrong_feed[41] ^= 1;
        assert_eq!(parse_pyth_sol_usd(&wrong_feed, publish), Err(SourceError::BadOracle));
        let mut partial = d.clone();
        partial[40] = 0;
        assert_eq!(parse_pyth_sol_usd(&partial, publish), Err(SourceError::BadOracle));
        let mut wide = d.clone();
        wide[81..89].copy_from_slice(&(i64_at(&d, 73) as u64 / 10).to_le_bytes()); // 10% confidence
        assert_eq!(parse_pyth_sol_usd(&wide, publish), Err(SourceError::BadOracle));
    }

    #[test]
    fn real_quote_is_plausible() {
        let v = fx();
        let (_, _, base) = parse_token_account(&bytes(&v, "base_vault")).unwrap();
        let (_, _, quote) = parse_token_account(&bytes(&v, "quote_vault")).unwrap();
        let (supply, _) = parse_mint(&bytes(&v, "base_mint")).unwrap();
        let sol = 109_000_000u64; // $109
        let (mcap, liq) = pump_quote(base, quote, supply, sol).unwrap();
        // liquidity is exactly 2 * quote reserve (SOL) * price
        assert_eq!(liq, (quote as u128 * 2 * sol as u128 / 1_000_000_000) as u64);
        assert!(mcap > 10_000_000_000 && mcap < 10_000_000_000_000, "mcap {mcap} in $10k..$10M for this pool");
    }

    #[test]
    fn quote_math_exact_example() {
        // 1B tokens (6 dec) supply, pool: 100M tokens vs 100 SOL, SOL=$100 -> price 0.0001 $/token... mcap = $100k * 10 = $1M? check:
        // price per token = 100 SOL / 100M tokens = 1e-6 SOL = $1e-4 ; supply 1B tokens -> $100,000
        let (mcap, liq) = pump_quote(100_000_000 * 1_000_000, 100_000_000_000, 1_000_000_000 * 1_000_000, 100_000_000).unwrap();
        assert_eq!(mcap, 100_000_000_000); // $100,000
        assert_eq!(liq, 20_000_000_000); // 2 * 100 SOL * $100 = $20,000
    }

    #[test]
    fn rejects_zero_reserves_and_bad_layouts() {
        assert!(pump_quote(0, 1, 1, 1).is_err());
        assert!(pump_quote(1, 0, 1, 1).is_err());
        assert_eq!(parse_pool(&[0u8; 300]), Err(SourceError::BadLayout));
        assert_eq!(parse_pool(&[0u8; 10]), Err(SourceError::BadLayout));
        assert!(parse_token_account(&[0u8; 10]).is_err());
        assert!(parse_mint(&[0u8; 10]).is_err());
    }
}
