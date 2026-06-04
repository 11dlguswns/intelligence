// Mirrors the JSON the runner writes into public/data/.

export interface DimensionScores {
  [dimension: string]: number;
}

export interface HistoryModelEntry {
  requested: string;
  index: number;
  consistency: number;
  avgTtftMs: number | null;
  avgOutputTokens: number | null;
  dimensions: DimensionScores;
}

export interface HistoryRun {
  runId: string;
  startedAt: string;
  profile: string;
  effort: string;
  repeat: number;
  byModel: Record<string, HistoryModelEntry>;
}

export interface History {
  updatedAt: string | null;
  models: string[];
  dimensions: string[];
  runs: HistoryRun[];
}

export interface Attempt {
  raw: string;
  parsed: string | null;
  correct: boolean;
  ttftMs: number | null;
  durationMs: number | null;
  outputTokens: number | null;
  stopReason: string | null;
  error: string | null;
}

export interface QuestionSummary {
  id: string;
  dimension: string;
  title: string;
  passRate: number;
  modalAnswer: string | null;
  modalFreq: number;
  attempts: Attempt[];
}

export interface ModelResult {
  requested: string;
  resolved: string;
  index: number;
  consistency: number;
  avgTtftMs: number | null;
  avgOutputTokens: number | null;
  dimensions: DimensionScores;
  questions: QuestionSummary[];
}

export interface RunDetail {
  runId: string;
  startedAt: string;
  finishedAt: string;
  profile: string;
  effort: string;
  repeat: number;
  systemPrompt: string;
  models: ModelResult[];
}

export interface MetaQuestion {
  id: string;
  dimension: string;
  title: string;
  prompt: string;
  verify: Record<string, unknown>;
}

export interface Meta {
  updatedAt: string;
  profile: string;
  defaultEffort: string;
  systemPrompt: string;
  dimensions: string[];
  questions: MetaQuestion[];
}
