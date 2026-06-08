export interface Bar {
  dim: string;
  label: string;
  hint?: string; // which sub-dimensions this group combines (tooltip)
  cond: number | null; // self-range condition 0..100 (this group's own worst→best)
  abs: number | null; // absolute quality (tooltip only)
  varies: boolean; // false = no spread yet (degenerate), rendered muted
}

// Minimal per-ability condition bars — label · track · number. No section header, no
// stacked extra numbers; whitespace does the grouping (Vercel/Linear restraint).
export function DimensionBars({ bars, color }: { bars: Bar[]; color: string }) {
  return (
    <div className="c2-bars">
      {bars.map((b) => {
        const w = Math.max(0, Math.min(100, b.cond ?? 0));
        const title = `${b.label}${b.hint ? ` (${b.hint})` : ''}${b.abs != null ? ` · 컨디션 ${b.cond ?? '–'} · 절대 ${b.abs}점` : ''}`;
        return (
          <div className="c2-bar" key={b.dim} title={title}>
            <span className="c2-bar-label">{b.label}</span>
            <span className="c2-bar-track">
              <span className="c2-bar-fill" style={{ width: `${w}%`, background: color, opacity: b.varies ? 1 : 0.32 }} />
            </span>
            <span className="c2-bar-val">{b.cond ?? '–'}</span>
          </div>
        );
      })}
    </div>
  );
}
