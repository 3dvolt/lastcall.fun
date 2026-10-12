use anchor_lang::prelude::*;

use crate::constants::MAX_SLOTS;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketStatus {
    Open,
    ResolvedYes,
    ResolvedNo,
    Void,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Side {
    Yes,
    No,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    Yes,
    No,
    Void,
}

/// Where a market's price data comes from. Fixed at creation.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum SourceKind {
    /// TEST ONLY (needs the `demo-feed` build feature): a feed written by a publisher key.
    DemoFeed,
    /// PRODUCTION: a PumpSwap AMM pool quoted in SOL, priced on-chain from its vaults + Pyth SOL/USD.
    PumpSwap,
}

/// PDA ["market", creator, market_id (u64 LE)]
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub market_id: u64,
    pub collateral_mint: Pubkey,
    /// Token account PDA ["vault", market]; its owner is the market PDA.
    pub vault: Pubkey,
    /// Pubkey of the tracked token (opaque identifier; key of its DemoFeed).
    pub token_ref: Pubkey,
    /// Market cap threshold in USD, 6 decimals.
    pub threshold: u64,
    pub expiry_ts: i64,
    /// Length (seconds) of the final window that decides the outcome, ending at expiry_ts.
    pub resolution_window_secs: u32,
    /// Seconds per sample slot inside the window.
    pub sample_interval_secs: u32,
    /// Number of sample slots = ceil(window / interval), <= MAX_SLOTS.
    pub sample_slots: u16,
    /// Minimum median liquidity (USD, 6 decimals) in the window; below it the market is void.
    pub min_liquidity_usd: u64,
    /// DemoFeed source only: the publisher whose feed writes are accepted. Pubkey::default() for PumpSwap.
    pub oracle_authority: Pubkey,
    pub source_kind: SourceKind,
    /// PumpSwap: the pool account. DemoFeed: the feed PDA.
    pub source_pool: Pubkey,
    pub status: MarketStatus,
    pub yes_reserve: u64,
    pub no_reserve: u64,
    /// Complete sets minted. Invariant: vault balance == total_minted + fees_accrued - payouts.
    pub total_minted: u64,
    pub fee_bps: u16,
    pub fees_accrued: u64,
    /// Void only: redemption price per share, scaled by PRICE_SCALE (1e9).
    pub void_yes_price: u64,
    pub void_no_price: u64,
    /// Set at resolution: max collateral users can still redeem (excludes creator residual).
    pub user_obligation: u64,
    pub residual_claimed: bool,
    // ---- how it resolved (written by `resolve`, all derived on-chain from the sample buffer) ----
    pub res_samples: u16,
    pub res_above: u16,
    pub res_twap: u64,
    pub res_liq_median: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// PDA ["samples", market]. One slot per `sample_interval_secs` in the final window; first valid writer wins.
#[account]
pub struct SampleBuffer {
    pub market: Pubkey,
    pub bump: u8,
    pub count: u16,
    /// market cap in USD (6 decimals) read from the feed when the slot was recorded
    pub mcap: [u64; MAX_SLOTS],
    pub liquidity: [u64; MAX_SLOTS],
    pub filled: [bool; MAX_SLOTS],
}

impl SampleBuffer {
    pub const LEN: usize = 32 + 1 + 2 + MAX_SLOTS * 8 + MAX_SLOTS * 8 + MAX_SLOTS;
}

/// PDA ["position", market, user]
#[account]
#[derive(InitSpace)]
pub struct Position {
    pub market: Pubkey,
    pub user: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub redeemed: bool,
    pub bump: u8,
}

/// PDA ["feed", token_ref]. Price publisher account; written only by its authority.
#[account]
#[derive(InitSpace)]
pub struct DemoFeed {
    pub token_ref: Pubkey,
    /// USD price, 6 decimals.
    pub price: u64,
    /// Circulating supply in WHOLE tokens (decimals already applied). market_cap_usd6 = price * circulating_supply.
    pub circulating_supply: u64,
    /// USD liquidity, 6 decimals.
    pub liquidity_usd: u64,
    pub updated_ts: i64,
    pub authority: Pubkey,
    pub bump: u8,
}
