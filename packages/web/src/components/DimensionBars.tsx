export interface Bar {
  dim: string;
  label: string;
  hint?: string; // which sub-dimensions this group combines (tooltip)
  cond: number | null; // self-range condition 0..100 (this group's own worst→best)
  abs: number | null; // absolute quality, shown faint for context
  varies: boolean; // false = no spread yet (degenerate), rendered muted
}

// Per-dimension CONDITION bars — each normalized to that dimension's own observed range,
// so the fill shows how this capability is doing vs its own usual, not an absolute score.
export function DimensionBars({ bars, color }: { bars: Bar[]; color: string }) {
  return (
    <div className="dbars">
      {bars.map((b) => {
        const w = Math.max(0, Math.min(100, b.cond ?? 0));
        return (
          <div className="dbar" key={b.dim} title={`${b.label}${b.hint ? ` (${b.hint})` : ''}${b.abs != null ? ` · 컨디션 ${b.cond ?? '–'} · 절대 ${b.abs}점` : ''}`}>
            <span className="dbar-label">{b.label}</span>
            <span className="dbar-track">
              <span
                className="dbar-fill"
                style={{ width: `${w}%`, background: color, opacity: b.varies ? 1 : 0.4 }}
              />
            </span>
            <span className="dbar-val">
              <b>{b.cond ?? '–'}</b>
              {b.abs != null && <i className="dbar-abs">절대 {b.abs}</i>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
