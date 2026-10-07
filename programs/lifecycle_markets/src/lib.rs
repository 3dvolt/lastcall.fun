pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod math;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("2oLfv3LDx7bDCzbnkzuvmT13s6xrxWawJr97NcGmKwLJ");

#[program]
pub mod lifecycle_markets {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        market_id: u64,
        token_ref: Pubkey,
        threshold: u64,
        expiry_ts: i64,
        resolution_window_secs: u32,
        initial_liquidity: u64,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::create_market::handler(
            ctx,
            market_id,
            token_ref,
            threshold,
            expiry_ts,
            resolution_window_secs,
            initial_liquidity,
            fee_bps,
        )
    }

    pub fn buy(ctx: Context<Buy>, side: Side, collateral_in: u64, min_shares_out: u64) -> Result<()> {
        instructions::buy::handler(ctx, side, collateral_in, min_shares_out)
    }

    pub fn sell(ctx: Context<Sell>, side: Side, shares_in: u64, min_collateral_out: u64) -> Result<()> {
        instructions::sell::handler(ctx, side, shares_in, min_collateral_out)
    }

    pub fn resolve(ctx: Context<Resolve>, outcome: Outcome, evidence_hash: [u8; 32]) -> Result<()> {
        instructions::resolve::handler(ctx, outcome, evidence_hash)
    }

    pub fn redeem(ctx: Context<Redeem>) -> Result<()> {
        instructions::redeem::handler(ctx)
    }

    pub fn claim_residual(ctx: Context<ClaimResidual>) -> Result<()> {
        instructions::claim_residual::handler(ctx)
    }

    /// DEMO ONLY: writes the mock price feed. Centralized by design.
    pub fn demo_set_feed(
        ctx: Context<DemoSetFeed>,
        token_ref: Pubkey,
        price: u64,
        circulating_supply: u64,
        liquidity_usd: u64,
    ) -> Result<()> {
        instructions::demo_set_feed::handler(ctx, token_ref, price, circulating_supply, liquidity_usd)
    }
}
