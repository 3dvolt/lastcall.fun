use anchor_lang::prelude::*;

#[constant]
pub const MARKET_SEED: &[u8] = b"market";
#[constant]
pub const VAULT_SEED: &[u8] = b"vault";
#[constant]
pub const POSITION_SEED: &[u8] = b"position";
#[constant]
pub const FEED_SEED: &[u8] = b"feed";

/// Max trading fee: 10%.
pub const MAX_FEE_BPS: u16 = 1_000;
