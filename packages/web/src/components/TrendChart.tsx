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
}

export function TrendChart({ history, models, get, domain, unit = '', height = 300, refLines = [] }: Props) {
  const data = history.runs.map((run) => {
    const point: Record<string, number | string | null> = { name: shortTime(run.startedAt) };
    models.forEach((m) => {
      const e = run.byModel[m];
      point[m] = e ? get(e) : null;
    });
    return point;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 18, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 11 }} stroke="var(--border)" />
          <YAxis
            domain={domain ?? ['auto', 'auto']}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            stroke="var(--border)"
            width={46}
          />
          {refLines.map((r, i) => (
            <ReferenceLine
              key={i}
              y={r.y}
              stroke={r.color ?? 'var(--faint)'}
              strokeDasharray="5 4"
              label={{ value: r.label, position: 'insideTopRight', fill: 'var(--faint)', fontSize: 10 }}
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
              strokeWidth={2.5}
              dot={{ r: 3, strokeWidth: 0, fill: modelColor(m, i) }}
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
