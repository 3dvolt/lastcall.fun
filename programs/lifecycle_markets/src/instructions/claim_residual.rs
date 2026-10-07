use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::ResidualClaimed;
use crate::state::*;

#[derive(Accounts)]
pub struct ClaimResidual<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
        has_one = creator @ MarketError::UnauthorizedCreator,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        token::mint = market.collateral_mint,
        token::authority = creator,
    )]
    pub creator_collateral: Account<'info, TokenAccount>,
    #[account(mut, address = market.vault @ MarketError::AccountMismatch)]
    pub vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<ClaimResidual>) -> Result<()> {
    let m = &mut ctx.accounts.market;
    require!(m.status != MarketStatus::Open, MarketError::NotResolved);
    require!(!m.residual_claimed, MarketError::AlreadyClaimed);

    // vault == total_minted + fees_accrued (before any payout); users keep `user_obligation` reserved.
    let residual = m
        .total_minted
        .checked_add(m.fees_accrued)
        .and_then(|v| v.checked_sub(m.user_obligation))
        .ok_or(MarketError::MathOverflow)?;
    m.residual_claimed = true;

    if residual > 0 {
        let creator = m.creator;
        let id = m.market_id.to_le_bytes();
        let bump = [m.bump];
        let seeds: &[&[u8]] = &[MARKET_SEED, creator.as_ref(), &id, &bump];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator_collateral.to_account_info(),
                    authority: m.to_account_info(),
                },
                &[seeds],
            ),
            residual,
        )?;
    }
    emit!(ResidualClaimed { market: m.key(), creator: m.creator, amount: residual });
    Ok(())
}
