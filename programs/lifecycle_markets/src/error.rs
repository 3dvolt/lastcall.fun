use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("Math overflow or invalid arithmetic")]
    MathOverflow,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Reserve would exceed the supported maximum")]
    ReserveTooLarge,
    #[msg("Pool reserve too small for this operation")]
    InsufficientReserve,
    #[msg("Pool invariant would be violated")]
    InvariantViolated,
    #[msg("Slippage limit exceeded")]
    SlippageExceeded,
    #[msg("Market is not open")]
    MarketNotOpen,
    #[msg("Trading is closed: market expired")]
    TradingClosed,
    #[msg("Market has not expired yet")]
    NotExpired,
    #[msg("Market is not resolved")]
    NotResolved,
    #[msg("Signer is not the market creator")]
    UnauthorizedCreator,
    #[msg("Signer is not the feed authority")]
    UnauthorizedFeedAuthority,
    #[msg("Expiry must be in the future")]
    InvalidExpiry,
    #[msg("Invalid parameter")]
    InvalidParameter,
    #[msg("Fee too high")]
    FeeTooHigh,
    #[msg("Position already redeemed")]
    AlreadyRedeemed,
    #[msg("Residual already claimed")]
    AlreadyClaimed,
    #[msg("Not enough shares")]
    InsufficientShares,
    #[msg("Account does not match market")]
    AccountMismatch,
    #[msg("Collateral mint must not have a freeze authority (USDC is the only exception)")]
    InvalidCollateralMint,
    #[msg("Sampling is only possible inside the final resolution window")]
    OutsideWindow,
    #[msg("This sample slot is already filled")]
    SlotAlreadyFilled,
    #[msg("The price feed is stale or from the future")]
    StaleFeed,
    #[msg("Invalid sampling configuration")]
    InvalidSampling,
    #[msg("Price source account is not the one registered for this market")]
    InvalidOracle,
    #[msg("Unsupported or invalid price source")]
    InvalidSource,
    #[msg("The demo price feed is disabled in this build")]
    DemoDisabled,
    #[msg("Samples must be recorded by a transaction that contains only this instruction")]
    NotStandalone,
    #[msg("The token's issuer can print supply or holds a Token-2022 power over the pool (mint authority, permanent delegate, transfer hook, pausable)")]
    UnsafeToken,
}

impl From<crate::math::MathError> for MarketError {
    fn from(e: crate::math::MathError) -> Self {
        use crate::math::MathError::*;
        match e {
            Overflow => MarketError::MathOverflow,
            ZeroAmount => MarketError::ZeroAmount,
            ReserveTooLarge => MarketError::ReserveTooLarge,
            InsufficientReserve => MarketError::InsufficientReserve,
            InvariantViolated => MarketError::InvariantViolated,
        }
    }
}

impl From<crate::sources::SourceError> for MarketError {
    fn from(e: crate::sources::SourceError) -> Self {
        use crate::sources::SourceError::*;
        match e {
            BadLayout | WrongProgram => MarketError::InvalidSource,
            BadOracle => MarketError::InvalidOracle,
            StaleOracle => MarketError::StaleFeed,
            Math => MarketError::MathOverflow,
            UnsafeMint => MarketError::UnsafeToken,
        }
    }
}
