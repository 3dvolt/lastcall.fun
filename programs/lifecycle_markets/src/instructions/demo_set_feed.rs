use anchor_lang::prelude::*;

use crate::constants::*;
use crate::error::MarketError;
use crate::events::FeedUpdated;
use crate::state::*;

/// DEMO ONLY. The first signer to write a feed for a `token_ref` becomes its authority; the resolver
/// service must therefore check `feed.authority` against its configured demo authority key.
#[derive(Accounts)]
#[instruction(token_ref: Pubkey)]
pub struct DemoSetFeed<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + DemoFeed::INIT_SPACE,
        seeds = [FEED_SEED, token_ref.as_ref()],
        bump
    )]
    pub feed: Account<'info, DemoFeed>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DemoSetFeed>,
    token_ref: Pubkey,
    price: u64,
    circulating_supply: u64,
    liquidity_usd: u64,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let feed = &mut ctx.accounts.feed;
    if feed.authority == Pubkey::default() {
        feed.authority = ctx.accounts.authority.key();
        feed.token_ref = token_ref;
        feed.bump = ctx.bumps.feed;
    } else {
        require_keys_eq!(feed.authority, ctx.accounts.authority.key(), MarketError::UnauthorizedFeedAuthority);
    }
    feed.price = price;
    feed.circulating_supply = circulating_supply;
    feed.liquidity_usd = liquidity_usd;
    feed.updated_ts = now;
    emit!(FeedUpdated { token_ref, price, circulating_supply, liquidity_usd, ts: now });
    Ok(())
}
