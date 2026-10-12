use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::constants::*;
use crate::error::MarketError;
use crate::events::MarketCreated;
use crate::math::MAX_RESERVE;
use crate::sources;
use crate::state::*;

#[derive(Accounts)]
#[instruction(market_id: u64, token_ref: Pubkey)]
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
    #[account(constraint = collateral_allowed(collateral_mint.freeze_authority.is_none(), &collateral_mint.key()) @ MarketError::InvalidCollateralMint)]
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
    /// CHECK: the token mint (`token_ref`); for PumpSwap markets the handler requires a Token/Token-2022 mint whose issuer cannot print supply.
    #[account(address = token_ref @ MarketError::InvalidSource)]
    pub token_mint: UncheckedAccount<'info>,
    /// CHECK: validated in the handler according to `source_kind` (PumpSwap pool, or the demo feed PDA).
    pub source_account: UncheckedAccount<'info>,
    #[account(
        init,
        payer = creator,
        space = 8 + SampleBuffer::LEN,
        seeds = [SAMPLES_SEED, market.key().as_ref()],
        bump
    )]
    pub sample_buffer: Box<Account<'info, SampleBuffer>>,
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
    sample_interval_secs: u32,
    min_liquidity_usd: u64,
    source_kind: SourceKind,
    oracle_authority: Pubkey,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(expiry_ts > now, MarketError::InvalidExpiry);
    // there must be a trading phase before the final window opens (trading closes when the window starts)
    require!(i64::from(resolution_window_secs) < expiry_ts - now, MarketError::InvalidExpiry);
    require!(threshold > 0, MarketError::InvalidParameter);
    require!(resolution_window_secs > 0, MarketError::InvalidParameter);
    require!(resolution_window_secs <= MAX_WINDOW_SECS, MarketError::InvalidParameter);
    require!(sample_interval_secs >= MIN_INTERVAL_SECS && sample_interval_secs <= resolution_window_secs, MarketError::InvalidSampling);
    let slots = resolution_window_secs.div_ceil(sample_interval_secs);
    require!(slots >= u32::from(MIN_SLOTS) && slots as usize <= MAX_SLOTS, MarketError::InvalidSampling);
    require!(min_liquidity_usd >= MIN_LIQUIDITY_FLOOR_USD, MarketError::InvalidParameter);
    let src = &ctx.accounts.source_account;
    match source_kind {
        SourceKind::DemoFeed => {
            require!(cfg!(feature = "demo-feed"), MarketError::DemoDisabled);
            require!(oracle_authority != Pubkey::default(), MarketError::InvalidOracle);
            let feed = Pubkey::find_program_address(&[FEED_SEED, token_ref.as_ref()], &crate::ID).0;
            require_keys_eq!(src.key(), feed, MarketError::InvalidSource);
        }
        SourceKind::PumpSwap => {
            require!(oracle_authority == Pubkey::default(), MarketError::InvalidOracle);
            require_keys_eq!(*src.owner, sources::PUMPSWAP_PROGRAM, MarketError::InvalidSource);
            let pool = sources::parse_pool(&src.try_borrow_data()?).map_err(MarketError::from)?;
            // the token must be the pool's BASE side and the quote must be SOL
            require_keys_eq!(pool.base_mint, token_ref, MarketError::InvalidSource);
            require_keys_eq!(pool.quote_mint, sources::WSOL_MINT, MarketError::InvalidSource);
            let mint = &ctx.accounts.token_mint;
            require!(sources::is_token_program(mint.owner), MarketError::InvalidSource);
            sources::check_mint_safety(&mint.try_borrow_data()?).map_err(MarketError::from)?;
        }
    }
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
    m.sample_interval_secs = sample_interval_secs;
    m.sample_slots = slots as u16;
    m.min_liquidity_usd = min_liquidity_usd;
    m.oracle_authority = oracle_authority;
    m.source_kind = source_kind;
    m.source_pool = ctx.accounts.source_account.key();
    m.status = MarketStatus::Open;
    m.yes_reserve = initial_liquidity;
    m.no_reserve = initial_liquidity;
    m.total_minted = initial_liquidity;
    m.fee_bps = fee_bps;
    m.fees_accrued = 0;
    m.void_yes_price = 0;
    m.void_no_price = 0;
    m.user_obligation = 0;
    m.residual_claimed = false;
    m.res_samples = 0;
    m.res_above = 0;
    m.res_twap = 0;
    m.res_liq_median = 0;
    let buf = &mut ctx.accounts.sample_buffer;
    buf.market = m.key();
    buf.bump = ctx.bumps.sample_buffer;
    buf.count = 0;

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
        oracle_authority: m.oracle_authority,
        source_kind,
        source_pool: m.source_pool,
        sample_interval_secs,
        sample_slots: m.sample_slots,
        min_liquidity_usd,
        initial_liquidity,
        fee_bps,
    });
    Ok(())
}
