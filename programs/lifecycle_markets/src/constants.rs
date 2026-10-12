use anchor_lang::prelude::*;

#[constant]
pub const MARKET_SEED: &[u8] = b"market";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";
#[constant]
pub const FEED_SEED: &[u8] = b"feed";
#[constant]
pub const SAMPLES_SEED: &[u8] = b"samples";

/// Max trading fee: 10%.
pub const MAX_FEE_BPS: u16 = 1_000;
/// Max resolution window: 7 days.
pub const MAX_WINDOW_SECS: u32 = 7 * 24 * 3600;
/// The resolution window is split into at most this many sample slots.
pub const MAX_SLOTS: usize = 120;
pub const MIN_SLOTS: u16 = 6;
pub const MIN_INTERVAL_SECS: u32 = 5;
/// A sample is only accepted if the oracle feed was updated at most this many seconds ago.
pub const MAX_FEED_AGE_SECS: i64 = 60;

/// A market must demand at least this median liquidity ($5,000, USD 6 decimals): it stops a creator from
/// registering a nearly empty side pool of a token (cheap to manipulate) with a tiny liquidity requirement.
pub const MIN_LIQUIDITY_FLOOR_USD: u64 = 5_000_000_000;

/// Circle's USDC on mainnet-beta. It has a freeze authority (Circle can freeze accounts), which we accept ONLY for this mint:
/// any other collateral with a freeze authority could freeze the vault and lock every user's funds.
pub const USDC_MAINNET: Pubkey = pubkey!("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

pub fn collateral_allowed(no_freeze_authority: bool, mint: &Pubkey) -> bool {
    no_freeze_authority || *mint == USDC_MAINNET
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn freezable_collateral_is_rejected_except_usdc() {
        let other = Pubkey::new_unique();
        assert!(collateral_allowed(true, &other)); // no freeze authority: fine
        assert!(!collateral_allowed(false, &other)); // freezable and unknown: rejected
        assert!(collateral_allowed(false, &USDC_MAINNET)); // the one accepted exception
    }
}
