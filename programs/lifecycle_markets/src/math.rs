//! Pure pricing math (no Anchor types) so it can be unit-tested natively and mirrored 1:1 in the TS SDK.
//!
//! Model: fixed-product market maker with two reserves `y` (YES) and `n` (NO).
//! All rounding favours the pool. All arithmetic is checked.

pub const BPS_DENOM: u128 = 10_000;
/// Fixed-point scale for Void redemption prices (1.0 == PRICE_SCALE).
pub const PRICE_SCALE: u128 = 1_000_000_000;
/// Upper bound for reserves and total_minted so that (y + s + n)^2 always fits in u128.
pub const MAX_RESERVE: u64 = 1 << 62;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MathError {
    Overflow,
    ZeroAmount,
    ReserveTooLarge,
    InsufficientReserve,
    InvariantViolated,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BuyQuote {
    pub fee: u64,
    pub net: u64,
    pub shares_out: u64,
    pub new_own: u64,
    pub new_other: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SellQuote {
    /// Collateral released from the pool (burned complete sets), before fee.
    pub gross: u64,
    pub fee: u64,
    pub payout: u64,
    pub new_own: u64,
    pub new_other: u64,
}

fn u(x: u64) -> u128 {
    x as u128
}

fn to_u64(x: u128) -> Result<u64, MathError> {
    u64::try_from(x).map_err(|_| MathError::Overflow)
}

/// ceil(a / b), b > 0
pub fn ceil_div(a: u128, b: u128) -> Result<u128, MathError> {
    if b == 0 {
        return Err(MathError::Overflow);
    }
    Ok(a.div_ceil(b))
}

/// fee = ceil(amount * fee_bps / 10_000)
pub fn fee_of(amount: u64, fee_bps: u16) -> Result<u64, MathError> {
    let num = u(amount).checked_mul(fee_bps as u128).ok_or(MathError::Overflow)?;
    to_u64(ceil_div(num, BPS_DENOM)?)
}

/// floor(sqrt(x))
pub fn isqrt_floor(x: u128) -> u128 {
    if x < 2 {
        return x;
    }
    // Newton iteration from an upper bound.
    let mut r = 1u128 << (128 - x.leading_zeros()).div_ceil(2);
    loop {
        let next = (r + x / r) >> 1;
        if next >= r {
            return r;
        }
        r = next;
    }
}

/// ceil(sqrt(x))
pub fn isqrt_ceil(x: u128) -> u128 {
    let f = isqrt_floor(x);
    if f * f == x {
        f
    } else {
        f + 1
    }
}

/// Buy `own`-side shares (own = reserve of the side being bought, other = opposite reserve).
///
/// net = amount - fee; new_own = own + net; new_other = other + net;
/// own' = ceil(own*other / new_other); shares_out = new_own - own'.
pub fn quote_buy(own: u64, other: u64, amount: u64, fee_bps: u16) -> Result<BuyQuote, MathError> {
    if amount == 0 {
        return Err(MathError::ZeroAmount);
    }
    let fee = fee_of(amount, fee_bps)?;
    let net = amount.checked_sub(fee).ok_or(MathError::Overflow)?;
    if net == 0 {
        return Err(MathError::ZeroAmount);
    }
    let new_own_pre = own.checked_add(net).ok_or(MathError::Overflow)?;
    let new_other = other.checked_add(net).ok_or(MathError::Overflow)?;
    if new_own_pre > MAX_RESERVE || new_other > MAX_RESERVE {
        return Err(MathError::ReserveTooLarge);
    }
    let k = u(own).checked_mul(u(other)).ok_or(MathError::Overflow)?;
    let own_after = to_u64(ceil_div(k, u(new_other))?)?;
    let shares_out = new_own_pre.checked_sub(own_after).ok_or(MathError::Overflow)?;
    if shares_out == 0 {
        return Err(MathError::ZeroAmount);
    }
    Ok(BuyQuote { fee, net, shares_out, new_own: own_after, new_other })
}

/// Sell `shares` of the `own` side back to the pool.
///
/// r solves (own + s - r)(other - r) = own*other, i.e.
/// r = ((own+s+other) - sqrt((own+s+other)^2 - 4*s*other)) / 2.
/// r is floored (sqrt is ceiled) so the pool product never decreases.
pub fn quote_sell(own: u64, other: u64, shares: u64, fee_bps: u16) -> Result<SellQuote, MathError> {
    if shares == 0 {
        return Err(MathError::ZeroAmount);
    }
    let s = u(shares);
    let sum = u(own)
        .checked_add(s)
        .and_then(|x| x.checked_add(u(other)))
        .ok_or(MathError::Overflow)?;
    if sum > 3 * (MAX_RESERVE as u128) {
        return Err(MathError::ReserveTooLarge);
    }
    let sq = sum.checked_mul(sum).ok_or(MathError::Overflow)?;
    let four_s_other = s
        .checked_mul(u(other))
        .and_then(|x| x.checked_mul(4))
        .ok_or(MathError::Overflow)?;
    let disc = sq.checked_sub(four_s_other).ok_or(MathError::Overflow)?;
    let root = isqrt_ceil(disc);
    let r = (sum.checked_sub(root).ok_or(MathError::Overflow)?) / 2;
    let gross = to_u64(r)?;
    if gross == 0 {
        return Err(MathError::ZeroAmount);
    }
    if gross >= other {
        return Err(MathError::InsufficientReserve);
    }
    let new_own = to_u64(u(own) + s - r)?;
    let new_other = other - gross;
    // Pool product must not decrease.
    let before = u(own) * u(other);
    let after = u(new_own).checked_mul(u(new_other)).ok_or(MathError::Overflow)?;
    if after < before {
        return Err(MathError::InvariantViolated);
    }
    let fee = fee_of(gross, fee_bps)?;
    let payout = gross.checked_sub(fee).ok_or(MathError::Overflow)?;
    Ok(SellQuote { gross, fee, payout, new_own, new_other })
}

/// Marginal Void prices (scaled by PRICE_SCALE), rounded down: (yes, no).
/// yes = n/(y+n), no = y/(y+n).
pub fn void_prices(yes_reserve: u64, no_reserve: u64) -> Result<(u64, u64), MathError> {
    let den = u(yes_reserve).checked_add(u(no_reserve)).ok_or(MathError::Overflow)?;
    if den == 0 {
        return Err(MathError::Overflow);
    }
    let py = u(no_reserve) * PRICE_SCALE / den;
    let pn = u(yes_reserve) * PRICE_SCALE / den;
    Ok((to_u64(py)?, to_u64(pn)?))
}

/// Payout of a Void redemption (floors each leg).
pub fn void_payout(yes_shares: u64, no_shares: u64, p_yes: u64, p_no: u64) -> Result<u64, MathError> {
    let a = u(yes_shares).checked_mul(u(p_yes)).ok_or(MathError::Overflow)? / PRICE_SCALE;
    let b = u(no_shares).checked_mul(u(p_no)).ok_or(MathError::Overflow)? / PRICE_SCALE;
    to_u64(a.checked_add(b).ok_or(MathError::Overflow)?)
}

/// Upper bound on everything users can ever redeem when the market is Void (rounded up).
/// users hold (T - y) YES and (T - n) NO.
pub fn void_obligation(total_minted: u64, yes_reserve: u64, no_reserve: u64, p_yes: u64, p_no: u64) -> Result<u64, MathError> {
    let yes_users = u(total_minted.checked_sub(yes_reserve).ok_or(MathError::Overflow)?);
    let no_users = u(total_minted.checked_sub(no_reserve).ok_or(MathError::Overflow)?);
    let num = yes_users
        .checked_mul(u(p_yes))
        .and_then(|a| no_users.checked_mul(u(p_no)).and_then(|b| a.checked_add(b)))
        .ok_or(MathError::Overflow)?;
    to_u64(ceil_div(num, PRICE_SCALE)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn isqrt_exact() {
        for x in 0u128..5000 {
            let f = isqrt_floor(x);
            assert!(f * f <= x && (f + 1) * (f + 1) > x, "floor {x}");
            let c = isqrt_ceil(x);
            assert!(c * c >= x && (c == 0 || (c - 1) * (c - 1) < x), "ceil {x}");
        }
        let big = u128::MAX;
        let f = isqrt_floor(big);
        assert_eq!(f, u64::MAX as u128);
        let sq = (1u128 << 60) + 12345;
        let f = isqrt_floor(sq * sq);
        assert_eq!(f, sq);
    }

    #[test]
    fn buy_worked_example() {
        // y=n=1000, buy 100 YES, no fee -> 190 shares, reserves (910, 1100)
        let q = quote_buy(1000, 1000, 100, 0).unwrap();
        assert_eq!(q.shares_out, 190);
        assert_eq!((q.new_own, q.new_other), (910, 1100));
    }

    #[test]
    fn sell_inverts_buy() {
        // Immediately selling the shares just bought returns at most what was paid (no fee).
        let b = quote_buy(1000, 1000, 100, 0).unwrap();
        let s = quote_sell(b.new_own, b.new_other, b.shares_out, 0).unwrap();
        assert!(s.gross <= 100 && s.gross >= 98, "gross={}", s.gross);
    }

    #[test]
    fn sell_product_never_decreases_random() {
        use rand::{Rng, SeedableRng};
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        for _ in 0..20_000 {
            let own = rng.gen_range(1..1u64 << 50);
            let other = rng.gen_range(1..1u64 << 50);
            let s = rng.gen_range(1..1u64 << 50);
            if let Ok(q) = quote_sell(own, other, s, 0) {
                assert!(u(q.new_own) * u(q.new_other) >= u(own) * u(other));
                assert!(q.gross < s, "user must receive < 1 per share");
                // Exact root would exceed gross by < 1 + epsilon: check gross+1 breaks the invariant or hits bound
                let r1 = q.gross as u128 + 1;
                let p = (u(own) + u(s) - r1) * (u(other).saturating_sub(r1));
                assert!(p <= u(own) * u(other) || r1 >= u(other));
            }
        }
    }

    #[test]
    fn buy_product_never_decreases_random() {
        use rand::{Rng, SeedableRng};
        let mut rng = rand::rngs::StdRng::seed_from_u64(11);
        for _ in 0..20_000 {
            let own = rng.gen_range(1..1u64 << 50);
            let other = rng.gen_range(1..1u64 << 50);
            let a = rng.gen_range(1..1u64 << 50);
            let fee = rng.gen_range(0..1000u16);
            if let Ok(q) = quote_buy(own, other, a, fee) {
                assert!(u(q.new_own) * u(q.new_other) >= u(own) * u(other));
                assert_eq!(q.fee + q.net, a);
                assert!(q.shares_out >= q.net, "price <= 1 so shares >= net collateral");
            }
        }
    }

    #[test]
    fn void_prices_sum_le_one() {
        let (a, b) = void_prices(910, 1100).unwrap();
        assert!(a as u128 + b as u128 <= PRICE_SCALE);
    }
}
