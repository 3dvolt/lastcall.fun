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
    #[msg("Signer is not the market resolver")]
    UnauthorizedResolver,
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
    #[msg("Invalid resolution outcome")]
    InvalidOutcome,
    #[msg("Account does not match market")]
    AccountMismatch,
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
