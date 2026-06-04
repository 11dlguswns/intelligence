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
export const CALIBRATION_FILE = path.join(DATA_DIR, 'calibration.json');
export const BASELINE_FILE = path.join(DATA_DIR, 'baselines.json');

// Defaults (override on the CLI: --models / --repeat / --effort).
// Default to haiku only so an accidental `npm run bench` is cheap on rate limits.
export const DEFAULT_MODELS = ['haiku'];
export const DEFAULT_REPEAT = 5;

// PINNED constant — and it must match between calibrate and bench. We use a LOW
// effort on purpose: at high effort these models ace even very hard arithmetic
// (no sensitive band in range), and "fast" low-effort answers are exactly what
// overload/quantization degrades. Do not vary this without starting a fresh series.
export const DEFAULT_EFFORT = 'low';

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

// ----- Condition-monitor design -----
// We don't compare models to each other. We calibrate EACH model to a difficulty
// "level" where it normally scores ~TARGET_PASS, lock that as its baseline, then
// watch for drops (overload / optimization throttling) against its OWN baseline.

// Empirical finding: frontier models ace objective tasks even at low effort
// (haiku-low solved 8x7-digit multiplication, 7^16 mod 1000, 26-word constrained
// formatting — all correct, up to absurd difficulty). So ACCURACY is a ceiling and
// only moves on a real capability drop → we keep it as a TRIPWIRE at one fixed hard
// level. The day-to-day "condition" signal (resource throttling / overload, which is
// exactly what the user suspected) is LATENCY.

export const FIXED_LEVEL = 8; // tripwire difficulty (hard, but every healthy model passes)
export const BENCH_INSTANCES = 3; // distinct problems per family
export const BENCH_REPS = 2; // repeats of each (latency samples + self-consistency)
export const BASELINE_RUNS = 4; // lock each model's baseline after this many runs

// Latency condition: current mean TTFT vs the model's baseline mean (ratio).
export const LAT_WARN = 1.25; // 25% slower than usual
export const LAT_DEGRADED = 1.5; // 50% slower than usual
// Accuracy tripwire: drop in pass-rate points vs baseline.
export const ACC_WARN = 0.07;
export const ACC_DEGRADED = 0.15;
