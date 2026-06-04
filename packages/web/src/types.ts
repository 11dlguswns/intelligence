// Mirrors the condition-monitor JSON the runner writes into public/data/.

export type Status = 'normal' | 'warn' | 'degraded' | 'above' | 'baselining';

export interface ConditionInfo {
  status: Status;
  latencyRatio: number | null; // current mean TTFT / baseline mean TTFT
  accDelta: number | null; // pass-rate points vs baseline (tripwire)
}

export interface BaselineRef {
  ttftMean: number | null;
  ttftStd: number | null;
  passMean: number | null;
  locked: boolean;
  n: number;
}

export interface HistoryModelEntry {
  requested: string;
  level: number;
  passRate: number;
  consistency: number;
  avgTtftMs: number | null;
  medianTtftMs: number | null;
  avgDurationMs: number | null;
  avgOutputTokens: number | null;
  byFamily: Record<string, number>;
  baseline: BaselineRef;
  condition: ConditionInfo;
}

export interface HistoryRun {
  runId: string;
  startedAt: string;
  profile: string;
  effort: string;
  level: number;
  byModel: Record<string, HistoryModelEntry>;
}

export interface History {
  updatedAt: string | null;
  models: string[];
  families: string[];
  runs: HistoryRun[];
}

export interface Attempt {
  raw: string;
  parsed: string | null;
  correct: boolean;
  ttftMs: number | null;
  durationMs: number | null;
  outputTokens: number | null;
  error: string | null;
}

export interface Instance {
  prompt: string;
  answer: string;
  modalFreq: number;
  attempts: Attempt[];
}

export interface FamilyResult {
  id: string;
  title: string;
  passRate: number;
  consistency: number;
  instances: Instance[];
}

export interface ModelResult {
  requested: string;
  resolved: string;
  level: number;
  passRate: number;
  consistency: number;
  avgTtftMs: number | null;
  medianTtftMs: number | null;
  p90TtftMs: number | null;
  avgDurationMs: number | null;
  avgOutputTokens: number | null;
  byFamily: Record<string, number>;
  baseline: BaselineRef;
  condition: ConditionInfo;
  families: FamilyResult[];
}

export interface RunDetail {
  runId: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  effort: string;
  level: number;
  instances: number;
  reps: number;
  seedBase: string;
  systemPrompt: string;
  models: ModelResult[];
}

export interface Meta {
  updatedAt: string;
  profile: string;
  effort: string;
  level: number;
  baselineRuns: number;
  systemPrompt: string;
  families: { id: string; title: string }[];
}

export interface BaselineModel {
  requested: string;
  level: number;
  locked: boolean;
  ttftMs: { mean: number | null; std: number | null };
  durationMs: { mean: number | null };
  passRate: { mean: number; std: number };
  consistency: { mean: number };
  outputTokens: { mean: number | null };
  samples: { runId: string; ttftMean: number | null; durationMean: number | null; passRate: number; consistency: number; outputTokens: number | null }[];
}

export interface Baselines {
  baselineRuns: number;
  models: Record<string, BaselineModel>;
}
