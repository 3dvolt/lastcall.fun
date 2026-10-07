import { pct } from "../lib/format";

export function OddsBar({ yes }: { yes: number }) {
  return (
    <div className="odds" role="img" aria-label={`YES ${pct(yes)}, NO ${pct(1 - yes)}`}>
      <div className="odds-yes" style={{ width: `${yes * 100}%` }}><span>YES {pct(yes)}</span></div>
      <div className="odds-no" style={{ width: `${(1 - yes) * 100}%` }}><span>NO {pct(1 - yes)}</span></div>
    </div>
  );
}
