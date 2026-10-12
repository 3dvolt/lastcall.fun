use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::MarketError;
use crate::events::SampleRecorded;
use crate::sources;
use crate::state::*;

const COMPUTE_BUDGET_PROGRAM: Pubkey = pubkey!("ComputeBudget111111111111111111111111111111");
const INSTRUCTIONS_SYSVAR: Pubkey = pubkey!("Sysvar1nstructions1111111111111111111111111");

/// Permissionless. Anyone may record the market's price into the single free slot for "now".
/// The value is computed ON-CHAIN from accounts the program verifies against the addresses registered at creation:
/// the caller cannot supply or alter any number.
///
/// remaining_accounts:
///   PumpSwap: [pool, base_vault, quote_vault, base_mint, pyth_sol_usd]
///   DemoFeed (test builds): [feed]
#[derive(Accounts)]
pub struct RecordSample<'info> {
    pub recorder: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.creator.as_ref(), &market.market_id.to_le_bytes()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [SAMPLES_SEED, market.key().as_ref()],
        bump = sample_buffer.bump,
        has_one = market @ MarketError::AccountMismatch,
    )]
    pub sample_buffer: Box<Account<'info, SampleBuffer>>,
    /// CHECK: the instructions sysvar, used to require a standalone transaction.
    #[account(address = INSTRUCTIONS_SYSVAR)]
    pub instructions: UncheckedAccount<'info>,
}

/// Pure check over the raw instructions-sysvar bytes: layout = u16 count | u16 offsets[count] | instructions... | u16 current index.
/// Each instruction = u16 n_accounts | n * (1 flag byte + 32 key) | 32 program id | u16 data_len | data.
pub fn standalone_ok(d: &[u8], program_id: &Pubkey) -> bool {
    let rd = |o: usize| -> Option<usize> { d.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as usize) };
    let (Some(n), Some(current)) = (rd(0), d.len().checked_sub(2).and_then(rd)) else { return false };
    if n == 0 || current >= n {
        return false;
    }
    let prog_at = |i: usize| -> Option<Pubkey> {
        let off = rd(2 + 2 * i)?;
        let n_acc = rd(off)?;
        let p = off + 2 + 33 * n_acc;
        d.get(p..p + 32).map(|b| Pubkey::new_from_array(b.try_into().unwrap()))
    };
    // our instruction must be top-level (a CPI would show the CALLER's program here) ...
    if prog_at(current) != Some(*program_id) {
        return false;
    }
    // ... and nothing but this program and compute-budget may appear anywhere in the transaction
    (0..n).all(|i| matches!(prog_at(i), Some(p) if p == *program_id || p == COMPUTE_BUDGET_PROGRAM))
}

/// Blocks the classic "pump, sample, dump" inside ONE transaction.
fn require_standalone(sysvar: &AccountInfo) -> Result<()> {
    require!(standalone_ok(&sysvar.try_borrow_data()?, &crate::ID), MarketError::NotStandalone);
    Ok(())
}

fn read_pumpswap(m: &Market, ra: &[AccountInfo], now: i64) -> Result<(u64, u64)> {
    require!(ra.len() == 5, MarketError::InvalidSource);
    let (pool, base_vault, quote_vault, base_mint, pyth) = (&ra[0], &ra[1], &ra[2], &ra[3], &ra[4]);

    require_keys_eq!(pool.key(), m.source_pool, MarketError::InvalidSource);
    require_keys_eq!(*pool.owner, sources::PUMPSWAP_PROGRAM, MarketError::InvalidSource);
    let p = sources::parse_pool(&pool.try_borrow_data()?).map_err(MarketError::from)?;
    require_keys_eq!(p.base_mint, m.token_ref, MarketError::InvalidSource);
    require_keys_eq!(p.quote_mint, sources::WSOL_MINT, MarketError::InvalidSource);
    require_keys_eq!(base_vault.key(), p.base_vault, MarketError::InvalidSource);
    require_keys_eq!(quote_vault.key(), p.quote_vault, MarketError::InvalidSource);
    require_keys_eq!(base_mint.key(), m.token_ref, MarketError::InvalidSource);

    // all token accounts / mints must belong to a real token program (Token or Token-2022)
    for a in [base_vault, quote_vault, base_mint] {
        require!(sources::is_token_program(a.owner), MarketError::InvalidSource);
    }
    let (bv_mint, bv_owner, base_reserve) = sources::parse_token_account(&base_vault.try_borrow_data()?).map_err(MarketError::from)?;
    let (qv_mint, qv_owner, quote_reserve) = sources::parse_token_account(&quote_vault.try_borrow_data()?).map_err(MarketError::from)?;
    require_keys_eq!(bv_mint, m.token_ref, MarketError::InvalidSource);
    require_keys_eq!(qv_mint, sources::WSOL_MINT, MarketError::InvalidSource);
    require_keys_eq!(bv_owner, pool.key(), MarketError::InvalidSource);
    require_keys_eq!(qv_owner, pool.key(), MarketError::InvalidSource);
    let mint_data = base_mint.try_borrow_data()?;
    sources::check_mint_safety(&mint_data).map_err(MarketError::from)?; // issuer cannot inflate supply / drain the pool
    let (supply, _decimals) = sources::parse_mint(&mint_data).map_err(MarketError::from)?;

    require_keys_eq!(pyth.key(), sources::PYTH_SOL_USD_ACCOUNT, MarketError::InvalidOracle);
    require_keys_eq!(*pyth.owner, sources::PYTH_RECEIVER_PROGRAM, MarketError::InvalidOracle);
    let usd_per_sol = sources::parse_pyth_sol_usd(&pyth.try_borrow_data()?, now).map_err(MarketError::from)?;

    sources::pump_quote(base_reserve, quote_reserve, supply, usd_per_sol).map_err(|e| MarketError::from(e).into())
}

fn read_demo(m: &Market, ra: &[AccountInfo], now: i64) -> Result<(u64, u64)> {
    require!(cfg!(feature = "demo-feed"), MarketError::DemoDisabled);
    require!(ra.len() == 1, MarketError::InvalidSource);
    let a = &ra[0];
    require_keys_eq!(a.key(), m.source_pool, MarketError::InvalidSource);
    require_keys_eq!(*a.owner, crate::ID, MarketError::InvalidSource);
    let f = DemoFeed::try_deserialize(&mut &a.try_borrow_data()?[..])?;
    require_keys_eq!(f.authority, m.oracle_authority, MarketError::InvalidOracle);
    require!(f.updated_ts <= now && now - f.updated_ts <= MAX_FEED_AGE_SECS, MarketError::StaleFeed);
    let mcap = (f.price as u128).checked_mul(f.circulating_supply as u128).ok_or(MarketError::MathOverflow)?;
    Ok((u64::try_from(mcap).map_err(|_| MarketError::MathOverflow)?, f.liquidity_usd))
}

pub fn handler(ctx: Context<RecordSample>) -> Result<()> {
    require_standalone(&ctx.accounts.instructions.to_account_info())?;
    let now = Clock::get()?.unix_timestamp;
    let m = &ctx.accounts.market;
    require!(m.status == MarketStatus::Open, MarketError::MarketNotOpen);

    let window_start = m.expiry_ts.saturating_sub(i64::from(m.resolution_window_secs));
    require!(now >= window_start && now < m.expiry_ts, MarketError::OutsideWindow);
    let slot = ((now - window_start) / i64::from(m.sample_interval_secs)) as usize;
    require!(slot < m.sample_slots as usize, MarketError::OutsideWindow);
    require!(!ctx.accounts.sample_buffer.filled[slot], MarketError::SlotAlreadyFilled);

    let (mcap, liquidity) = match m.source_kind {
        SourceKind::PumpSwap => read_pumpswap(m, ctx.remaining_accounts, now)?,
        SourceKind::DemoFeed => read_demo(m, ctx.remaining_accounts, now)?,
    };

    let buf = &mut ctx.accounts.sample_buffer;
    buf.mcap[slot] = mcap;
    buf.liquidity[slot] = liquidity;
    buf.filled[slot] = true;
    buf.count += 1;

    emit!(SampleRecorded {
        market: m.key(),
        slot: slot as u16,
        market_cap: mcap,
        liquidity,
        ts: now,
        recorder: ctx.accounts.recorder.key(),
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// builds sysvar bytes for the given (program_id, n_accounts) instructions with the given current index
    fn sysvar(ixs: &[(Pubkey, usize)], current: u16) -> Vec<u8> {
        let mut body: Vec<Vec<u8>> = vec![];
        for (p, n_acc) in ixs {
            let mut b = (*n_acc as u16).to_le_bytes().to_vec();
            b.extend(vec![0u8; 33 * n_acc]);
            b.extend(p.to_bytes());
            b.extend(0u16.to_le_bytes()); // data_len
            body.push(b);
        }
        let mut out = (ixs.len() as u16).to_le_bytes().to_vec();
        let mut off = 2 + 2 * ixs.len();
        for b in &body {
            out.extend((off as u16).to_le_bytes());
            off += b.len();
        }
        for b in &body {
            out.extend(b);
        }
        out.extend(current.to_le_bytes());
        out
    }

    #[test]
    fn only_our_program_and_compute_budget_pass() {
        let me = Pubkey::new_unique();
        let other = Pubkey::new_unique();
        assert!(standalone_ok(&sysvar(&[(me, 4)], 0), &me));
        assert!(standalone_ok(&sysvar(&[(COMPUTE_BUDGET_PROGRAM, 0), (me, 5)], 1), &me));
        // a swap (or anything else) in the same transaction: rejected, before or after ours
        assert!(!standalone_ok(&sysvar(&[(other, 6), (me, 4), (other, 6)], 1), &me));
        assert!(!standalone_ok(&sysvar(&[(me, 4), (other, 1)], 0), &me));
        // invoked through another program (CPI): the top-level instruction is not ours
        assert!(!standalone_ok(&sysvar(&[(other, 3)], 0), &me));
    }
    #[test]
    fn malformed_data_is_rejected() {
        let me = Pubkey::new_unique();
        assert!(!standalone_ok(&[], &me));
        assert!(!standalone_ok(&[0, 0, 0, 0], &me));
        assert!(!standalone_ok(&sysvar(&[(me, 1)], 5), &me));
    }
}
