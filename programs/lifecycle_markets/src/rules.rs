//! The resolution rule, as a pure function (no Anchor types) so it can be unit-tested natively.
//!
//!  1. VOID  if median(liquidity) < min_liquidity  OR  coverage < 80%
//!  2. YES   if mean(market cap) >= threshold  AND  >= 90% of recorded samples are >= threshold
//!  3. NO    otherwise
//!
//! The window is split into equal time slots; each slot holds at most one sample. The mean is therefore a
//! time-weighted average (every filled slot weighs the same). Medians are the LOWER median (conservative).

pub const COVERAGE_NUM: u64 = 4; // 80%
pub const COVERAGE_DEN: u64 = 5;
pub const SUSTAINED_NUM: u64 = 9; // 90%
pub const SUSTAINED_DEN: u64 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    Yes,
    No,
    Void,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct WindowStats {
    pub samples: u16,
    pub above: u16,
    pub twap: u64,
    pub liq_median: u64,
}

/// `mcap`, `liq` and `filled` must have the same length (>= `slots`); only the first `slots` entries count.
pub fn evaluate(slots: u16, mcap: &[u64], liq: &[u64], filled: &[bool], threshold: u64, min_liquidity: u64) -> (Verdict, WindowStats) {
    let n_slots = slots as usize;
    let mut caps: Vec<u64> = Vec::with_capacity(n_slots);
    let mut liqs: Vec<u64> = Vec::with_capacity(n_slots);
    for i in 0..n_slots {
        if filled[i] {
            caps.push(mcap[i]);
            liqs.push(liq[i]);
        }
    }
    let n = caps.len() as u64;
    let mut stats = WindowStats { samples: n as u16, ..Default::default() };
    if n == 0 {
        return (Verdict::Void, stats);
    }
    let sum: u128 = caps.iter().map(|&c| c as u128).sum();
    stats.twap = (sum / n as u128) as u64;
    stats.above = caps.iter().filter(|&&c| c >= threshold).count() as u16;
    liqs.sort_unstable();
    stats.liq_median = liqs[(liqs.len() - 1) / 2];

    let coverage_ok = n * COVERAGE_DEN >= n_slots as u64 * COVERAGE_NUM;
    let liquidity_ok = stats.liq_median >= min_liquidity;
    if !coverage_ok || !liquidity_ok {
        return (Verdict::Void, stats);
    }
    let twap_ok = stats.twap >= threshold;
    let sustained_ok = stats.above as u64 * SUSTAINED_DEN >= n * SUSTAINED_NUM;
    (if twap_ok && sustained_ok { Verdict::Yes } else { Verdict::No }, stats)
}

#[cfg(test)]
mod tests {
    use super::*;

    const T: u64 = 1_000;
    const MIN_LIQ: u64 = 10_000;

    fn run(caps: &[u64], liq: u64, slots: u16) -> Verdict {
        let mut c = vec![0u64; slots as usize];
        let mut l = vec![0u64; slots as usize];
        let mut f = vec![false; slots as usize];
        for (i, &v) in caps.iter().enumerate() {
            c[i] = v;
            l[i] = liq;
            f[i] = true;
        }
        evaluate(slots, &c, &l, &f, T, MIN_LIQ).0
    }

    #[test]
    fn all_above_is_yes() {
        assert_eq!(run(&[1500; 30], 250_000, 30), Verdict::Yes);
    }
    #[test]
    fn sustained_boundary_is_90_percent() {
        let mut v = vec![1500u64; 27];
        v.extend([500; 3]); // 27/30 = 90% and TWAP = 1350: yes
        assert_eq!(run(&v, 250_000, 30), Verdict::Yes);
        let mut w = vec![1500u64; 26];
        w.extend([500; 4]); // 86.7%
        assert_eq!(run(&w, 250_000, 30), Verdict::No);
    }
    #[test]
    fn twap_must_also_be_above() {
        let mut v = vec![1001u64; 27];
        v.extend([0; 3]); // 90% above but mean = 900.9
        assert_eq!(run(&v, 250_000, 30), Verdict::No);
    }
    #[test]
    fn spike_does_not_win() {
        let mut v = vec![900u64; 24];
        v.extend([50_000; 6]); // mean above, only 20% of samples above
        assert_eq!(run(&v, 250_000, 30), Verdict::No);
        let mut p = vec![600u64; 28];
        p.extend([3_000; 2]); // pump in the last two slots
        assert_eq!(run(&p, 250_000, 30), Verdict::No);
    }
    #[test]
    fn coverage_boundary_is_80_percent() {
        assert_eq!(run(&[5000; 23], 250_000, 30), Verdict::Void); // 76.7%
        assert_eq!(run(&[5000; 24], 250_000, 30), Verdict::Yes); // exactly 80%
    }
    #[test]
    fn no_samples_is_void() {
        assert_eq!(run(&[], 0, 30), Verdict::Void);
    }
    #[test]
    fn liquidity_is_checked_before_yes() {
        assert_eq!(run(&[5000; 30], 9_999, 30), Verdict::Void);
        assert_eq!(run(&[5000; 30], 10_000, 30), Verdict::Yes);
    }
    #[test]
    fn lower_median_liquidity() {
        // 4 samples, liquidity [1, 1, 100000, 100000]: lower median = 1 -> void
        let c = [5000u64; 6];
        let l = [1u64, 1, 100_000, 100_000, 0, 0];
        let f = [true, true, true, true, false, false];
        assert_eq!(evaluate(6, &c, &l, &f, T, MIN_LIQ).0, Verdict::Void);
    }
    #[test]
    fn unfilled_slots_are_ignored() {
        let (v, s) = evaluate(10, &[2000; 10], &[50_000; 10], &[true, true, true, true, true, true, true, true, false, false], T, MIN_LIQ);
        assert_eq!(v, Verdict::Yes);
        assert_eq!((s.samples, s.above, s.twap), (8, 8, 2000));
    }
}
