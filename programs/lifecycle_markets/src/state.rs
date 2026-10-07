use anchor_lang::prelude::*;

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

/// PDA ["market", creator, market_id (u64 LE)]
#[account]
#[derive(InitSpace)]
pub struct Market {
    pub creator: Pubkey,
    pub market_id: u64,
    pub collateral_mint: Pubkey,
    /// Token account PDA ["vault", market]; its owner is the market PDA.
    pub vault: Pubkey,
    /// Pubkey of the tracked token (opaque identifier; used as DemoFeed key).
    pub token_ref: Pubkey,
    /// Market cap threshold in USD, 6 decimals.
    pub threshold: u64,
    pub expiry_ts: i64,
    /// Length (seconds) of the sampling window the resolver must evaluate, ending at expiry_ts.
    pub resolution_window_secs: u32,
    pub resolver: Pubkey,
    pub status: MarketStatus,
    pub yes_reserve: u64,
    pub no_reserve: u64,
    /// Complete sets minted. Invariant: vault balance == total_minted + fees_accrued - redeemed/claimed payouts.
    pub total_minted: u64,
    pub fee_bps: u16,
    /// Fees collected (stay in the vault, belong to the creator).
    pub fees_accrued: u64,
    pub evidence_hash: [u8; 32],
    /// Void only: redemption price per share, scaled by PRICE_SCALE (1e9).
    pub void_yes_price: u64,
    pub void_no_price: u64,
    /// Set at resolution: max collateral users can still redeem (excludes creator residual).
    pub user_obligation: u64,
    pub residual_claimed: bool,
    pub bump: u8,
    pub vault_bump: u8,
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

/// PDA ["feed", token_ref]. DEMO ONLY: centralized mock price feed.
#[account]
#[derive(InitSpace)]
pub struct DemoFeed {
    pub token_ref: Pubkey,
    /// USD price, 6 decimals.
    pub price: u64,
    /// Circulating supply in raw token units (see CONTRACT.md for decimals convention).
    pub circulating_supply: u64,
    /// USD liquidity, 6 decimals.
    pub liquidity_usd: u64,
    pub updated_ts: i64,
    pub authority: Pubkey,
    pub bump: u8,
}
