import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import type { History, HistoryModelEntry } from '../types';
import { modelColor, modelLabel } from '../lib/model';
import { shortTime } from '../lib/format';
import { isPeak } from '../lib/peak';

interface RefLine {
  y: number;
  label: string;
  color?: string;
}

interface Props {
  history: History;
  models: string[];
  get: (e: HistoryModelEntry) => number | null;
  domain?: [number | string, number | string];
  unit?: string;
  height?: number;
  refLines?: RefLine[];
  markPeak?: boolean;
}

// Peak-window points get a hollow ring around the dot.
function peakDot(color: string) {
  return (props: { cx?: number; cy?: number; index?: number; payload?: { _peak?: boolean } }) => {
    const { cx, cy, index, payload } = props;
    if (cx == null || cy == null) return <g key={index} />;
    if (payload?._peak) {
      return (
        <g key={index}>
          <circle cx={cx} cy={cy} r={6} fill="none" stroke={color} strokeWidth={1.4} opacity={0.55} />
          <circle cx={cx} cy={cy} r={3} fill={color} />
        </g>
      );
    }
    return <circle key={index} cx={cx} cy={cy} r={3} fill={color} />;
  };
}

export function TrendChart({ history, models, get, domain, unit = '', height = 300, refLines = [], markPeak = false }: Props) {
  const data = history.runs.map((run) => {
    const point: Record<string, number | string | boolean | null> = {
      name: shortTime(run.startedAt),
      _peak: isPeak(run.startedAt),
    };
    models.forEach((m) => {
      const e = run.byModel[m];
      point[m] = e ? get(e) : null;
    });
    return point;
  });

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 10 }} stroke="var(--border)" minTickGap={16} />
          <YAxis domain={domain ?? ['auto', 'auto']} tick={{ fill: 'var(--muted)', fontSize: 10 }} stroke="var(--border)" width={42} />
          {refLines.map((r, i) => (
            <ReferenceLine
              key={i}
              y={r.y}
              stroke={r.color ?? 'var(--faint)'}
              strokeDasharray="5 4"
              strokeOpacity={0.7}
            />
          ))}
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              fontSize: 12,
              color: 'var(--ink)',
            }}
            labelStyle={{ color: 'var(--muted)' }}
            formatter={(value: number | string, key: string) => [
              value == null ? '–' : `${value}${unit}`,
              modelLabel(String(key)),
            ]}
          />
          {models.map((m, i) => (
            <Line
              key={m}
              type="monotone"
              dataKey={m}
              name={modelLabel(m)}
              stroke={modelColor(m, i)}
              strokeWidth={2.25}
              dot={markPeak ? peakDot(modelColor(m, i)) : { r: 3, strokeWidth: 0, fill: modelColor(m, i) }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
