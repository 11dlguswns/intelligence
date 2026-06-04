// Central configuration for the benchmark runner.
//
// The "pure model capability" profile: we strip Claude Code's large agent system
// prompt down to a minimal neutral one, turn all tools off, and PIN the effort
// level. Pinning matters — effort directly changes reasoning depth ("intelligence"),
// so it must be constant across runs for the time-series to be comparable.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo root is three levels up from packages/runner/src/
export const ROOT = path.resolve(__dirname, '..', '..', '..');

// The dashboard reads these files at runtime; the runner writes them.
export const DATA_DIR = path.join(ROOT, 'packages', 'web', 'public', 'data');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const HISTORY_FILE = path.join(DATA_DIR, 'history.json');
export const LATEST_FILE = path.join(DATA_DIR, 'latest.json');
export const META_FILE = path.join(DATA_DIR, 'meta.json');

// Defaults (override on the CLI: --models / --repeat / --effort).
// Default to haiku only so an accidental `npm run bench` is cheap on rate limits.
export const DEFAULT_MODELS = ['haiku'];
export const DEFAULT_REPEAT = 5;

// PINNED constant. Do not vary this between runs unless you start a fresh series.
export const DEFAULT_EFFORT = 'high';

// Profile identifier recorded with every run.
export const PROFILE = 'pure';

// Politeness delay between calls (sequential calls are also gentler on rate limits).
export const CALL_DELAY_MS = 500;
export const PER_CALL_TIMEOUT_MS = 120000;

// Minimal, neutral system prompt that REPLACES Claude Code's default agent prompt
// (via --system-prompt). Applied identically to every model, so it is a constant,
// not a confounding variable. Keep it terse to minimize token overhead.
export const SYSTEM_PROMPT =
  'You are taking a short test. Read each question carefully and respond exactly as instructed, with no extra commentary, explanation, or formatting.';
