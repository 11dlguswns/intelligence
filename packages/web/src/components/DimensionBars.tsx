export interface Bar {
  dim: string;
  label: string;
  score: number | null;
}

// Horizontal bar graph of per-dimension scores (0-100).
export function DimensionBars({ bars, color }: { bars: Bar[]; color: string }) {
  return (
    <div className="dbars">
      {bars.map((b) => (
        <div className="dbar" key={b.dim}>
          <span className="dbar-label">{b.label}</span>
          <span className="dbar-track">
            <span className="dbar-fill" style={{ width: `${Math.max(0, Math.min(100, b.score ?? 0))}%`, background: color }} />
          </span>
          <span className="dbar-val">{b.score ?? '–'}</span>
        </div>
      ))}
    </div>
  );
}
