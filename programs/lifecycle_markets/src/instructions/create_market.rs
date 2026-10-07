use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::MarketCreated;
use crate::math::MAX_RESERVE;
use crate::state::*;

#[derive(Accounts)]
#[instruction(market_id: u64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [MARKET_SEED, creator.key().as_ref(), &market_id.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,
    pub collateral_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        seeds = [VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = collateral_mint,
        token::authority = market,
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = collateral_mint,
        token::authority = creator,
    )]
    pub creator_collateral: Account<'info, TokenAccount>,
    /// CHECK: only its pubkey is stored; it is the sole key allowed to call `resolve`.
    pub resolver: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn handler(
    ctx: Context<CreateMarket>,
    market_id: u64,
    token_ref: Pubkey,
    threshold: u64,
    expiry_ts: i64,
    resolution_window_secs: u32,
    initial_liquidity: u64,
    fee_bps: u16,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(expiry_ts > now, MarketError::InvalidExpiry);
    require!(threshold > 0, MarketError::InvalidParameter);
    require!(resolution_window_secs > 0, MarketError::InvalidParameter);
    require!(
        i64::from(resolution_window_secs) <= expiry_ts.saturating_sub(now).saturating_add(86_400 * 30),
        MarketError::InvalidParameter
    );
    require!(initial_liquidity > 0, MarketError::ZeroAmount);
    require!(initial_liquidity <= MAX_RESERVE / 4, MarketError::ReserveTooLarge);
    require!(fee_bps <= MAX_FEE_BPS, MarketError::FeeTooHigh);

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.creator_collateral.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        initial_liquidity,
    )?;

    let m = &mut ctx.accounts.market;
    m.creator = ctx.accounts.creator.key();
    m.market_id = market_id;
    m.collateral_mint = ctx.accounts.collateral_mint.key();
    m.vault = ctx.accounts.vault.key();
    m.token_ref = token_ref;
    m.threshold = threshold;
    m.expiry_ts = expiry_ts;
    m.resolution_window_secs = resolution_window_secs;
    m.resolver = ctx.accounts.resolver.key();
    m.status = MarketStatus::Open;
    m.yes_reserve = initial_liquidity;
    m.no_reserve = initial_liquidity;
    m.total_minted = initial_liquidity;
    m.fee_bps = fee_bps;
    m.fees_accrued = 0;
    m.evidence_hash = [0u8; 32];
    m.void_yes_price = 0;
    m.void_no_price = 0;
    m.user_obligation = 0;
    m.residual_claimed = false;
    m.bump = ctx.bumps.market;
    m.vault_bump = ctx.bumps.vault;

    emit!(MarketCreated {
        market: m.key(),
        creator: m.creator,
        market_id,
        token_ref,
        threshold,
        expiry_ts,
        resolution_window_secs,
        resolver: m.resolver,
        initial_liquidity,
        fee_bps,
    });
    Ok(())
}
