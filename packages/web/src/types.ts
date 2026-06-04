// Mirrors the intelligence-score JSON the runner writes into public/data/.

export type Status = 'normal' | 'warn' | 'degraded' | 'above' | 'baselining';

export interface ConditionInfo {
  status: Status;
  qDelta: number | null; // 지능 점수 points vs baseline
  latencyRatio: number | null;
}

export interface BaselineRef {
  qMedian: number | null;
  qStd: number | null;
  ttftMedian: number | null;
  locked: boolean;
  n: number;
}

export interface HistoryModelEntry {
  requested: string;
  qualityScore: number;
  avgTtftMs: number | null;
  byQuestion: Record<string, number>;
  baseline: BaselineRef;
  condition: ConditionInfo;
}

export interface HistoryRun {
  runId: string;
  startedAt: string;
  profile: string;
  answerEffort: string;
  byModel: Record<string, HistoryModelEntry>;
}

export interface History {
  updatedAt: string | null;
  models: string[];
  questions: string[];
  runs: HistoryRun[];
}

export interface QuestionResult {
  id: string;
  title: string;
  prompt: string;
  answer: string;
  score: number;
  ttftMs: number | null;
  error: string | null;
}

export interface ModelResult {
  requested: string;
  resolved: string;
  qualityScore: number;
  avgTtftMs: number | null;
  byQuestion: Record<string, number>;
  baseline: BaselineRef;
  condition: ConditionInfo;
  questions: QuestionResult[];
}

export interface RunDetail {
  runId: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  answerEffort: string;
  judgeModel: string;
  systemPrompt: string;
  models: ModelResult[];
}

export interface Meta {
  updatedAt: string;
  profile: string;
  answerEffort: string;
  judgeModel: string;
  baselineRuns: number;
  systemPrompt: string;
  questions: { id: string; title: string }[];
}

export interface BaselineModel {
  requested: string;
  locked: boolean;
  samples: { runId: string; qualityScore: number; ttftMean: number | null }[];
  qualityScore: { median: number; std: number };
  ttftMs: { median: number | null };
}

export interface Baselines {
  baselineRuns: number;
  models: Record<string, BaselineModel>;
}
