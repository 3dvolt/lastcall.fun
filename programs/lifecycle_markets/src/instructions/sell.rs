use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::Trade;
use crate::math;
use crate::state::*;

#[derive(Accounts)]
pub struct Sell<'info> {
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [POSITION_SEED, market.key().as_ref(), user.key().as_ref()],
        bump = position.bump,
        has_one = market @ MarketError::AccountMismatch,
        has_one = user @ MarketError::AccountMismatch,
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
}

pub fn handler(ctx: Context<Sell>, side: Side, shares_in: u64, min_collateral_out: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let market = &mut ctx.accounts.market;
    require!(market.status == MarketStatus::Open, MarketError::MarketNotOpen);
    // Trading closes when the final window OPENS: the AMM prices (used by Void settlement) cannot be moved while the oracle is sampled.
    let trading_ends = market.expiry_ts.checked_sub(i64::from(market.resolution_window_secs)).ok_or(MarketError::MathOverflow)?;
    require!(now < trading_ends, MarketError::TradingClosed);

    let pos = &mut ctx.accounts.position;
    let held = match side {
        Side::Yes => pos.yes_shares,
        Side::No => pos.no_shares,
    };
    require!(shares_in <= held, MarketError::InsufficientShares);

    let (own, other) = match side {
        Side::Yes => (market.yes_reserve, market.no_reserve),
        Side::No => (market.no_reserve, market.yes_reserve),
    };
    let q = math::quote_sell(own, other, shares_in, market.fee_bps).map_err(MarketError::from)?;
    require!(q.payout >= min_collateral_out, MarketError::SlippageExceeded);

    market.total_minted = market.total_minted.checked_sub(q.gross).ok_or(MarketError::MathOverflow)?;
    market.fees_accrued = market.fees_accrued.checked_add(q.fee).ok_or(MarketError::MathOverflow)?;
    match side {
        Side::Yes => {
            market.yes_reserve = q.new_own;
            market.no_reserve = q.new_other;
            pos.yes_shares -= shares_in;
        }
        Side::No => {
            market.no_reserve = q.new_own;
            market.yes_reserve = q.new_other;
            pos.no_shares -= shares_in;
        }
    }

    let creator = market.creator;
    let id = market.market_id.to_le_bytes();
    let bump = [market.bump];
    let seeds: &[&[u8]] = &[MARKET_SEED, creator.as_ref(), &id, &bump];
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_collateral.to_account_info(),
                authority: market.to_account_info(),
            },
            &[seeds],
        ),
        q.payout,
    )?;

    emit!(Trade {
        market: market.key(),
        user: ctx.accounts.user.key(),
        side,
        is_buy: false,
        collateral: q.payout,
        shares: shares_in,
        fee: q.fee,
        yes_reserve: market.yes_reserve,
        no_reserve: market.no_reserve,
        ts: now,
    });
    Ok(())
}
