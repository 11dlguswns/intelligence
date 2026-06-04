// Tiny, dependency-free SVG sparkline: shows how a model's response time is trending
// (the "rate of change") in a compact strip. Updates live as auto-refresh adds points.

interface Props {
  values: number[];
  color: string;
  baseline?: number | null;
  height?: number;
}

export function Sparkline({ values, color, baseline, height = 44 }: Props) {
  if (values.length < 2) return <div className="spark-empty">추세 쌓는 중…</div>;

  const W = 240;
  const H = 46;
  const all = baseline != null ? [...values, baseline] : values;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = (max - min) * 0.18 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const X = (i: number) => (i / (values.length - 1)) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo)) * H;

  const line = values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const area = `M0,${H} ` + values.map((v, i) => `L${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ') + ` L${W},${H} Z`;
  const gid = `spk-${color.replace('#', '')}`;

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && (
        <line
          x1="0"
          x2={W}
          y1={Y(baseline).toFixed(1)}
          y2={Y(baseline).toFixed(1)}
          stroke="var(--faint)"
          strokeDasharray="3 3"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path d={area} fill={`url(#${gid})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="2.25"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
