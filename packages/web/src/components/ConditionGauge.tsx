// Condition gauge — normalized to THIS model's own observed range, so a tiny absolute
// change (e.g. 94 vs 97 on a 0-100 quality scale) becomes a big, readable swing.
//
// The track spans the model's observed [min..max] (its full dynamic range). A shaded green
// band marks normal variation (median ± 1σ); today's marker sits where the current score
// falls. Position is the user-requested "self-relative" view (low end ↔ high end), while
// the shaded band keeps it honest: inside = normal noise, below = a real condition dip.

interface Props {
  lo: number; // observed min (0 end)
  hi: number; // observed max (100 end)
  med: number;
  sd: number;
  cur: number;
  color: string;
  belowBand: boolean;
}

export function ConditionGauge({ lo, hi, med, sd, cur, color, belowBand }: Props) {
  // pad the track a touch beyond the observed range so markers near the edge stay visible
  const range = Math.max(hi - lo, 0.1);
  const pad = Math.max(range * 0.12, 0.4);
  const tLo = Math.min(lo, med - sd) - pad;
  const tHi = Math.max(hi, med + sd) + pad;
  const span = tHi - tLo || 1;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - tLo) / span) * 100));

  const bandL = pct(med - sd);
  const bandR = pct(med + sd);
  const curX = pct(cur);
  const markCol = belowBand ? 'var(--down, #c0492f)' : color;

  return (
    <div className="cond-gauge" aria-hidden>
      <div className="cond-track">
        <div className="cond-band" style={{ left: `${bandL}%`, width: `${Math.max(bandR - bandL, 1)}%` }} />
        <div className="cond-mid" style={{ left: `${pct(med)}%` }} />
        <div className="cond-mark" style={{ left: `${curX}%`, background: markCol, borderColor: markCol, boxShadow: `0 0 0 3px var(--bg), 0 0 11px -1px ${markCol}` }} />
      </div>
      <div className="cond-ends">
        <span>{Math.round(lo)}</span>
        <span className="cond-mid-lbl">평소 {Math.round(med)}</span>
        <span>{Math.round(hi)}</span>
      </div>
    </div>
  );
}
