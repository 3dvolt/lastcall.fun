use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::Trade;
use crate::math;
use crate::state::*;

#[derive(Accounts)]
pub struct Buy<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + Position::INIT_SPACE,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    #[account(
        mut,
        token::mint = market.collateral_mint,
        token::authority = user,
    )]
    pub user_collateral: Account<'info, TokenAccount>,
    #[account(mut, address = market.vault @ MarketError::AccountMismatch)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<Buy>, side: Side, collateral_in: u64, min_shares_out: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now < market.expiry_ts, MarketError::TradingClosed);

    let (own, other) = match side {
        Side::Yes => (market.yes_reserve, market.no_reserve),
        Side::No => (market.no_reserve, market.yes_reserve),
    };
    let q = math::quote_buy(own, other, collateral_in, market.fee_bps).map_err(MarketError::from)?;
    require!(q.shares_out >= min_shares_out, MarketError::SlippageExceeded);

    let new_total = market.total_minted.checked_add(q.net).ok_or(MarketError::MathOverflow)?;
    require!(new_total <= math::MAX_RESERVE, MarketError::ReserveTooLarge);
    let new_fees = market.fees_accrued.checked_add(q.fee).ok_or(MarketError::MathOverflow)?;

    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.user_collateral.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        ),
        collateral_in,
    )?;

    match side {
        Side::Yes => {
            market.yes_reserve = q.new_own;
            market.no_reserve = q.new_other;
        }
        Side::No => {
            market.no_reserve = q.new_own;
            market.yes_reserve = q.new_other;
        }
    }
    market.total_minted = new_total;
    market.fees_accrued = new_fees;

    let pos = &mut ctx.accounts.position;
    if pos.market == Pubkey::default() {
        pos.market = market.key();
        pos.user = ctx.accounts.user.key();
        pos.bump = ctx.bumps.position;
    }
    match side {
        Side::Yes => pos.yes_shares = pos.yes_shares.checked_add(q.shares_out).ok_or(MarketError::MathOverflow)?,
        Side::No => pos.no_shares = pos.no_shares.checked_add(q.shares_out).ok_or(MarketError::MathOverflow)?,
    }

    emit!(Trade {
        market: market.key(),
        user: ctx.accounts.user.key(),
        side,
        is_buy: true,
        collateral: collateral_in,
        shares: q.shares_out,
        fee: q.fee,
        yes_reserve: market.yes_reserve,
        no_reserve: market.no_reserve,
        ts: now,
    });
    Ok(())
}
