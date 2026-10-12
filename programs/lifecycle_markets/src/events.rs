use anchor_lang::prelude::*;

use crate::state::{Outcome, Side, SourceKind};

#[event]
pub struct MarketCreated {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub market_id: u64,
    pub token_ref: Pubkey,
    pub threshold: u64,
    pub expiry_ts: i64,
    pub resolution_window_secs: u32,
    pub oracle_authority: Pubkey,
    pub source_kind: SourceKind,
    pub source_pool: Pubkey,
    pub sample_interval_secs: u32,
    pub sample_slots: u16,
    pub min_liquidity_usd: u64,
    pub initial_liquidity: u64,
    pub fee_bps: u16,
}

#[event]
pub struct Trade {
    pub market: Pubkey,
    pub user: Pubkey,
    pub side: Side,
    /// true = buy, false = sell
    pub is_buy: bool,
    /// Collateral paid in (buy, gross incl. fee) or paid out (sell, net of fee).
    pub collateral: u64,
    pub shares: u64,
    pub fee: u64,
    pub yes_reserve: u64,
    pub no_reserve: u64,
    pub ts: i64,
}

#[event]
pub struct Resolved {
    pub market: Pubkey,
    pub outcome: Outcome,
    pub resolved_by: Pubkey,
    pub samples: u16,
    pub above: u16,
    pub twap: u64,
    pub liq_median: u64,
    pub yes_reserve: u64,
    pub no_reserve: u64,
    pub user_obligation: u64,
    pub ts: i64,
}

#[event]
pub struct Redeemed {
    pub market: Pubkey,
    pub user: Pubkey,
    pub yes_shares: u64,
    pub no_shares: u64,
    pub payout: u64,
}

#[event]
pub struct ResidualClaimed {
    pub market: Pubkey,
    pub creator: Pubkey,
    pub amount: u64,
}

#[event]
pub struct FeedUpdated {
    pub token_ref: Pubkey,
    pub price: u64,
    pub circulating_supply: u64,
    pub liquidity_usd: u64,
    pub ts: i64,
}

#[event]
pub struct SampleRecorded {
    pub market: Pubkey,
    pub slot: u16,
    pub market_cap: u64,
    pub liquidity: u64,
    pub ts: i64,
    pub recorder: Pubkey,
}
