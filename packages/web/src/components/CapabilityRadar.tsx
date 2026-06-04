import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { HistoryRun } from '../types';
import { modelColor, modelLabel } from '../lib/model';

interface Props {
  run: HistoryRun;
  models: string[];
  families: string[];
  height?: number;
}

// Per-family pass rate for the latest run. NOTE: each model is tested at its OWN
// calibrated level, so this shows where a model is relatively weak — not a
// cross-model comparison of absolute difficulty.
export function CapabilityRadar({ run, models, families, height = 300 }: Props) {
  const present = models.filter((m) => run.byModel[m]);
  const data = families.map((fam) => {
    const row: Record<string, number | string> = { family: fam };
    present.forEach((m) => {
      row[m] = Math.round((run.byModel[m].byFamily?.[fam] ?? 0) * 100);
    });
    return row;
  });

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="family" tick={{ fill: 'var(--muted)', fontSize: 11 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fill: 'var(--faint)', fontSize: 9 }} angle={90} />
          {present.map((m, i) => (
            <Radar
              key={m}
              name={modelLabel(m)}
              dataKey={m}
              stroke={modelColor(m, i)}
              fill={modelColor(m, i)}
              fillOpacity={0.18}
              strokeWidth={2}
              isAnimationActive={false}
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
            formatter={(value: number | string, key: string) => [`${value}%`, modelLabel(String(key))]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
