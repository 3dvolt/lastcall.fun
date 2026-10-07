use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::Redeemed;
use crate::math;
use crate::state::*;

#[derive(Accounts)]
pub struct Redeem<'info> {
    pub user: Signer<'info>,
    #[account(
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

pub fn handler(ctx: Context<Redeem>) -> Result<()> {
    let m = &ctx.accounts.market;
    let pos = &mut ctx.accounts.position;
    require!(m.status != MarketStatus::Open, MarketError::NotResolved);
    require!(!pos.redeemed, MarketError::AlreadyRedeemed);

    let payout = match m.status {
        MarketStatus::ResolvedYes => pos.yes_shares,
        MarketStatus::ResolvedNo => pos.no_shares,
        MarketStatus::Void => {
            math::void_payout(pos.yes_shares, pos.no_shares, m.void_yes_price, m.void_no_price)
                .map_err(MarketError::from)?
        }
        MarketStatus::Open => return err!(MarketError::NotResolved),
    };
    pos.redeemed = true;

    if payout > 0 {
        let creator = m.creator;
        let id = m.market_id.to_le_bytes();
        let bump = [m.bump];
        let seeds: &[&[u8]] = &[MARKET_SEED, creator.as_ref(), &id, &bump];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.user_collateral.to_account_info(),
                    authority: ctx.accounts.market.to_account_info(),
                },
                &[seeds],
            ),
            payout,
        )?;
    }

    emit!(Redeemed {
        market: m.key(),
        user: ctx.accounts.user.key(),
        yes_shares: pos.yes_shares,
        no_shares: pos.no_shares,
        payout,
    });
    Ok(())
}
