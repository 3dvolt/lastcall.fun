use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::MarketError;
use crate::events::Resolved;
use crate::math;
use crate::rules::{self, Verdict};
use crate::state::*;

/// Permissionless: ANYONE can resolve after expiry. The outcome is computed here, from the on-chain sample
/// buffer, by the public rule in `rules.rs`. There is no resolver key and no off-chain evidence.
#[derive(Accounts)]
pub struct Resolve<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        seeds = [SAMPLES_SEED, market.key().as_ref()],
        bump = sample_buffer.bump,
        has_one = market @ MarketError::AccountMismatch,
    )]
    pub sample_buffer: Box<Account<'info, SampleBuffer>>,
}

/// Freezes the market as Void at the current marginal prices.
pub fn apply_void(m: &mut Market) -> Result<()> {
    let (py, pn) = math::void_prices(m.yes_reserve, m.no_reserve).map_err(MarketError::from)?;
    m.void_yes_price = py;
    m.void_no_price = pn;
    m.user_obligation =
        math::void_obligation(m.total_minted, m.yes_reserve, m.no_reserve, py, pn).map_err(MarketError::from)?;
    m.status = MarketStatus::Void;
    Ok(())
}

pub fn handler(ctx: Context<Resolve>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let m = &mut ctx.accounts.market;
    require!(m.status == MarketStatus::Open, MarketError::MarketNotOpen);
    require!(now >= m.expiry_ts, MarketError::NotExpired);

    let buf = &ctx.accounts.sample_buffer;
    let (verdict, stats) =
        rules::evaluate(m.sample_slots, &buf.mcap, &buf.liquidity, &buf.filled, m.threshold, m.min_liquidity_usd);

    let t = m.total_minted;
    let outcome = match verdict {
        Verdict::Yes => {
            m.status = MarketStatus::ResolvedYes;
            m.user_obligation = t.checked_sub(m.yes_reserve).ok_or(MarketError::MathOverflow)?;
            Outcome::Yes
        }
        Verdict::No => {
            m.status = MarketStatus::ResolvedNo;
            m.user_obligation = t.checked_sub(m.no_reserve).ok_or(MarketError::MathOverflow)?;
            Outcome::No
        }
        Verdict::Void => {
            apply_void(m)?;
            Outcome::Void
        }
    };
    m.res_samples = stats.samples;
    m.res_above = stats.above;
    m.res_twap = stats.twap;
    m.res_liq_median = stats.liq_median;

    emit!(Resolved {
        market: m.key(),
        outcome,
        resolved_by: ctx.accounts.caller.key(),
        samples: stats.samples,
        above: stats.above,
        twap: stats.twap,
        liq_median: stats.liq_median,
        yes_reserve: m.yes_reserve,
        no_reserve: m.no_reserve,
        user_obligation: m.user_obligation,
        ts: now,
    });
    Ok(())
}
