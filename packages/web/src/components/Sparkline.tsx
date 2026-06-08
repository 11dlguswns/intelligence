// Smooth trend sparkline: Catmull-Rom → cubic-bezier curve (no jagged segments),
// soft gradient area, faint dashed baseline (the model's 평소), and a glowing dot at
// the latest point. Fills its container responsively.

interface Props {
  values: number[];
  color: string;
  baseline?: number | null;
}

const W = 100;
const H = 100;
const INSET = 3; // keep the end dot inside the box

function smoothPath(p: ReadonlyArray<readonly [number, number]>): string {
  if (p.length < 2) return '';
  let d = `M ${p[0][0].toFixed(2)},${p[0][1].toFixed(2)}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] ?? p[i];
    const p1 = p[i];
    const p2 = p[i + 1];
    const p3 = p[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

export function Sparkline({ values, color, baseline }: Props) {
  if (values.length < 2) return <div className="spark-empty">추세 쌓는 중…</div>;

  const all = baseline != null ? [...values, baseline] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.22 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const n = values.length;
  const X = (i: number) => INSET + (i / (n - 1)) * (W - 2 * INSET);
  const Y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

  const pts = values.map((v, i) => [X(i), Y(v)] as const);
  const line = smoothPath(pts);
  const area = `${line} L ${pts[n - 1][0].toFixed(2)},${H} L ${pts[0][0].toFixed(2)},${H} Z`;
  const gid = `spk-${color.replace('#', '')}`;
  const last = pts[n - 1];
  const baseY = baseline != null ? Y(baseline) : null;

  return (
    <>
      <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {baseY != null && (
          <line x1="0" x2={W} y1={baseY.toFixed(1)} y2={baseY.toFixed(1)} stroke="var(--faint)" strokeOpacity="0.55" strokeDasharray="2 3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        )}
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        className="spark-dot"
        style={{ left: `${last[0]}%`, top: `${last[1]}%`, background: color, boxShadow: `0 0 0 3px var(--panel), 0 0 9px ${color}` }}
      />
    </>
  );
}
