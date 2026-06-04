#!/usr/bin/env node
// Condition monitor (latency-primary). For each model, run a FIXED hard task set and
// measure mostly LATENCY (TTFT) — the resource/throttling signal — plus an accuracy
// TRIPWIRE and self-consistency, all compared to the model's OWN locked baseline.
// No per-model difficulty calibration: frontier models ace these regardless, so
// accuracy only moves on a real capability drop.
//
//   node src/bench.mjs [--models opus,sonnet,haiku] [--effort low]
//                      [--instances 3] [--reps 2] [--level 8]

import fs from 'node:fs';
import path from 'node:path';

import { FAMILIES, FAMILY_IDS } from './families.mjs';
import { askClaude } from './claude.mjs';
import { makeRng } from './rng.mjs';
import {
  RUNS_DIR, HISTORY_FILE, LATEST_FILE, META_FILE, BASELINE_FILE,
  DEFAULT_EFFORT, PROFILE, SYSTEM_PROMPT, CALL_DELAY_MS,
  FIXED_LEVEL, BENCH_INSTANCES, BENCH_REPS, BASELINE_RUNS,
  LAT_WARN, LAT_DEGRADED, ACC_WARN, ACC_DEGRADED,
} from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const round3 = (n) => Math.round(n * 1000) / 1000;
const round2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const quantile = (a, q) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const idx = Math.min(s.length - 1, Math.floor(q * (s.length - 1)));
  return s[idx];
};
const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');

function modalFreq(values) {
  const c = new Map();
  for (const v of values) c.set(v, (c.get(v) || 0) + 1);
  let best = 0;
  for (const n of c.values()) if (n > best) best = n;
  return values.length ? best / values.length : 0;
}

function parseArgs(argv) {
  const o = { models: ['haiku'], effort: DEFAULT_EFFORT, instances: BENCH_INSTANCES, reps: BENCH_REPS, level: FIXED_LEVEL };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') o.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--effort') o.effort = argv[++i];
    else if (a === '--instances') o.instances = Math.max(1, parseInt(argv[++i], 10) || BENCH_INSTANCES);
    else if (a === '--reps') o.reps = Math.max(1, parseInt(argv[++i], 10) || BENCH_REPS);
    else if (a === '--level') o.level = Math.max(1, parseInt(argv[++i], 10) || FIXED_LEVEL);
  }
  return o;
}

const makeRunId = () =>
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;

// Latency-primary condition vs the model's locked baseline. Accuracy acts as a
// stronger override (a real capability drop trumps a latency blip).
function condition(ttftMean, passRate, base) {
  if (!base || !base.locked) return { status: 'baselining', latencyRatio: null, accDelta: null };
  const accDelta = passRate - base.passRate.mean;
  const ratio = base.ttftMs.mean ? ttftMean / base.ttftMs.mean : 1;
  let status;
  if (accDelta <= -ACC_DEGRADED) status = 'degraded';
  else if (ratio >= LAT_DEGRADED) status = 'degraded';
  else if (ratio >= LAT_WARN || accDelta <= -ACC_WARN) status = 'warn';
  else if (ratio <= 0.8) status = 'above'; // notably faster than usual
  else status = 'normal';
  return { status, latencyRatio: round2(ratio), accDelta: round3(accDelta) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const runId = makeRunId();
  const startedAt = nowIso();
  const seedBase = runId;
  const baselines = readJson(BASELINE_FILE, { baselineRuns: BASELINE_RUNS, models: {} });

  console.log(
    `\n▶ Condition run ${runId} — level ${opts.level} effort=${opts.effort} ` +
      `instances=${opts.instances} reps=${opts.reps} models=${opts.models.join(',')}`
  );

  const modelsOut = [];
  for (const requested of opts.models) {
    console.log(`\n◆ ${requested}`);
    let resolved = requested;
    const families = [];
    const ttfts = [];
    const durations = [];
    const outs = [];

    for (const fam of FAMILIES) {
      const instances = [];
      for (let i = 0; i < opts.instances; i++) {
        const rng = makeRng(`${seedBase}|${requested}|${fam.id}|${i}`);
        const inst = fam.generate(opts.level, rng);
        const attempts = [];
        for (let r = 0; r < opts.reps; r++) {
          const res = askClaude(requested, inst.prompt, { effort: opts.effort });
          if (res.resolvedModel) resolved = res.resolvedModel;
          const sc = res.ok ? inst.score(res.result) : { parsed: null, correct: false };
          attempts.push({
            raw: res.result, parsed: sc.parsed, correct: sc.correct,
            ttftMs: res.ttftMs, durationMs: res.durationMs, outputTokens: res.outputTokens, error: res.error,
          });
          if (res.ttftMs != null) ttfts.push(res.ttftMs);
          if (res.durationMs != null) durations.push(res.durationMs);
          if (res.outputTokens != null) outs.push(res.outputTokens);
          process.stdout.write(sc.correct ? '✓' : res.ok ? '✗' : '!');
          await sleep(CALL_DELAY_MS);
        }
        instances.push({
          prompt: inst.prompt,
          answer: inst.answer,
          modalFreq: round3(modalFreq(attempts.map((a) => a.parsed ?? '∅'))),
          attempts,
        });
      }
      const att = instances.flatMap((x) => x.attempts);
      const passRate = att.length ? att.filter((a) => a.correct).length / att.length : 0;
      const consistency = mean(instances.map((x) => x.modalFreq));
      families.push({ id: fam.id, title: fam.title, passRate: round3(passRate), consistency: round3(consistency), instances });
    }

    const allAtt = families.flatMap((f) => f.instances.flatMap((x) => x.attempts));
    const passRate = allAtt.length ? allAtt.filter((a) => a.correct).length / allAtt.length : 0;
    const consistency = mean(families.map((f) => f.consistency));
    const ttftMean = ttfts.length ? Math.round(mean(ttfts)) : null;
    const ttftMedian = ttfts.length ? Math.round(quantile(ttfts, 0.5)) : null;
    const ttftP90 = ttfts.length ? Math.round(quantile(ttfts, 0.9)) : null;
    const durationMean = durations.length ? Math.round(mean(durations)) : null;
    const outMean = outs.length ? Math.round(mean(outs)) : null;

    // Baseline: accumulate first BASELINE_RUNS runs, then lock.
    const b =
      baselines.models[resolved] ||
      (baselines.models[resolved] = { requested, level: opts.level, samples: [], locked: false });
    b.requested = requested;
    b.level = opts.level;
    if (!b.locked) {
      b.samples.push({
        runId, ttftMean, durationMean, passRate: round3(passRate), consistency: round3(consistency), outputTokens: outMean,
      });
      const tt = b.samples.map((s) => s.ttftMean).filter((x) => x != null);
      const dd = b.samples.map((s) => s.durationMean).filter((x) => x != null);
      const pp = b.samples.map((s) => s.passRate);
      const cc = b.samples.map((s) => s.consistency);
      const oo = b.samples.map((s) => s.outputTokens).filter((x) => x != null);
      b.ttftMs = { mean: tt.length ? Math.round(mean(tt)) : null, std: tt.length ? Math.round(std(tt)) : null };
      b.durationMs = { mean: dd.length ? Math.round(mean(dd)) : null };
      b.passRate = { mean: round3(mean(pp)), std: round3(std(pp)) };
      b.consistency = { mean: round3(mean(cc)) };
      b.outputTokens = { mean: oo.length ? Math.round(mean(oo)) : null };
      if (b.samples.length >= (baselines.baselineRuns || BASELINE_RUNS)) b.locked = true;
    }

    const cond = condition(ttftMean ?? 0, passRate, b);
    const baseTxt = b.locked
      ? `ttft ${b.ttftMs.mean}ms / acc ${(b.passRate.mean * 100).toFixed(0)}%`
      : `forming ${b.samples.length}/${baselines.baselineRuns || BASELINE_RUNS}`;
    console.log(
      `\n  acc ${(passRate * 100).toFixed(0)}%  ttft ${ttftMean ?? '–'}ms (med ${ttftMedian ?? '–'})  ` +
        `consistency ${(consistency * 100).toFixed(0)}%  | baseline ${baseTxt}  → ${cond.status}` +
        (cond.latencyRatio != null ? ` (×${cond.latencyRatio} latency)` : '')
    );

    modelsOut.push({
      requested, resolved, level: opts.level,
      passRate: round3(passRate), consistency: round3(consistency),
      avgTtftMs: ttftMean, medianTtftMs: ttftMedian, p90TtftMs: ttftP90,
      avgDurationMs: durationMean, avgOutputTokens: outMean,
      byFamily: Object.fromEntries(families.map((f) => [f.id, f.passRate])),
      baseline: {
        ttftMean: b.ttftMs ? b.ttftMs.mean : null,
        ttftStd: b.ttftMs ? b.ttftMs.std : null,
        passMean: b.passRate ? b.passRate.mean : null,
        locked: b.locked,
        n: b.samples.length,
      },
      condition: cond,
      families,
    });
  }

  const finishedAt = nowIso();
  const run = {
    runId, startedAt, finishedAt, profile: PROFILE, effort: opts.effort, level: opts.level,
    instances: opts.instances, reps: opts.reps, seedBase, systemPrompt: SYSTEM_PROMPT, models: modelsOut,
  };
  writeJson(path.join(RUNS_DIR, `${runId}.json`), run);
  writeJson(LATEST_FILE, run);
  writeJson(BASELINE_FILE, baselines);

  const history = readJson(HISTORY_FILE, { updatedAt: null, models: [], families: FAMILY_IDS, runs: [] });
  const byModel = {};
  for (const m of modelsOut) {
    byModel[m.resolved] = {
      requested: m.requested, level: m.level, passRate: m.passRate, consistency: m.consistency,
      avgTtftMs: m.avgTtftMs, medianTtftMs: m.medianTtftMs, avgDurationMs: m.avgDurationMs,
      avgOutputTokens: m.avgOutputTokens, byFamily: m.byFamily, baseline: m.baseline, condition: m.condition,
    };
  }
  history.runs.push({ runId, startedAt, profile: PROFILE, effort: opts.effort, level: opts.level, byModel });
  history.models = [...new Set([...(history.models || []), ...modelsOut.map((m) => m.resolved)])];
  history.families = FAMILY_IDS;
  history.updatedAt = finishedAt;
  writeJson(HISTORY_FILE, history);

  writeJson(META_FILE, {
    updatedAt: finishedAt, profile: PROFILE, effort: opts.effort, level: opts.level,
    baselineRuns: baselines.baselineRuns || BASELINE_RUNS, systemPrompt: SYSTEM_PROMPT,
    families: FAMILIES.map((f) => ({ id: f.id, title: f.title })),
  });

  console.log(`\n✔ run ${runId} written; history holds ${history.runs.length} run(s)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
