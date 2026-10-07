use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::MarketError;
use crate::events::Resolved;
use crate::math;
use crate::state::*;

#[derive(Accounts)]
pub struct Resolve<'info> {
    pub resolver: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
        has_one = resolver @ MarketError::UnauthorizedResolver,
    )]
    pub market: Account<'info, Market>,
}

pub fn handler(ctx: Context<Resolve>, outcome: Outcome, evidence_hash: [u8; 32]) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    require!(m.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now >= m.expiry_ts, MarketError::NotExpired);

    let t = m.total_minted;
    match outcome {
        Outcome::Yes => {
            m.status = MarketStatus::ResolvedYes;
            m.user_obligation = t.checked_sub(m.yes_reserve).ok_or(MarketError::MathOverflow)?;
        }
        Outcome::No => {
            m.status = MarketStatus::ResolvedNo;
            m.user_obligation = t.checked_sub(m.no_reserve).ok_or(MarketError::MathOverflow)?;
        }
        Outcome::Void => {
            let (py, pn) = math::void_prices(m.yes_reserve, m.no_reserve).map_err(MarketError::from)?;
            m.void_yes_price = py;
            m.void_no_price = pn;
            m.user_obligation =
                math::void_obligation(t, m.yes_reserve, m.no_reserve, py, pn).map_err(MarketError::from)?;
            m.status = MarketStatus::Void;
        }
    }
    m.evidence_hash = evidence_hash;

    emit!(Resolved {
        market: m.key(),
        outcome,
        evidence_hash,
        yes_reserve: m.yes_reserve,
        no_reserve: m.no_reserve,
        user_obligation: m.user_obligation,
        ts: now,
    });
    Ok(())
}
