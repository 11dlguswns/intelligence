#!/usr/bin/env node
// Intelligence-score run. For each model: answer hard open-ended questions, have an
// independent Opus judge grade each answer 0-100, average to a 지능 점수, and compare
// to the model's OWN baseline (a drop = it got dumber). Latency is kept as a secondary
// signal. Objective accuracy was dropped — it is at ceiling and cannot discriminate.
//
//   node src/bench.mjs [--models opus,sonnet,haiku] [--effort medium]

import fs from 'node:fs';
import path from 'node:path';

import { QUALITY_QUESTIONS, QUESTION_IDS, JUDGE_MODEL, gradeAnswer } from './quality.mjs';
import { askClaude } from './claude.mjs';
import {
  RUNS_DIR, HISTORY_FILE, LATEST_FILE, META_FILE, BASELINE_FILE,
  ANSWER_EFFORT, PROFILE, SYSTEM_PROMPT, CALL_DELAY_MS,
  BASELINE_RUNS, QUALITY_WARN, QUALITY_DEGRADED, LAT_DEGRADED,
} from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const std = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor((s.length - 1) / 2)];
};
const readJson = (f, d) => {
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  } catch {
    return d;
  }
};
const writeJson = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 2) + '\n');

function parseArgs(argv) {
  const o = { models: ['haiku'], effort: ANSWER_EFFORT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') o.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--effort') o.effort = argv[++i];
  }
  return o;
}

const makeRunId = () =>
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;

// Quality-primary condition vs the model's own baseline. Latency is secondary.
function condition(quality, ttftMean, base) {
  if (!base || !base.locked) return { status: 'baselining', qDelta: null, latencyRatio: null };
  const qDelta = quality - base.qualityScore.median;
  const ratio = base.ttftMs.median ? ttftMean / base.ttftMs.median : 1;
  let status = 'normal';
  if (qDelta <= -QUALITY_DEGRADED) status = 'degraded';
  else if (qDelta <= -QUALITY_WARN) status = 'warn';
  else if (qDelta >= QUALITY_WARN) status = 'above';
  else if (ratio >= LAT_DEGRADED) status = 'warn'; // quality fine but very slow
  return { status, qDelta: round1(qDelta), latencyRatio: round2(ratio) };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const runId = makeRunId();
  const startedAt = nowIso();
  const baselines = readJson(BASELINE_FILE, { baselineRuns: BASELINE_RUNS, models: {} });
  baselines.baselineRuns = BASELINE_RUNS;

  console.log(`\n▶ Intelligence run ${runId} — answer effort=${opts.effort} judge=${JUDGE_MODEL} models=${opts.models.join(',')}`);

  const modelsOut = [];
  for (const requested of opts.models) {
    console.log(`\n◆ ${requested}`);
    let resolved = requested;
    const questions = [];
    const ttfts = [];

    for (const q of QUALITY_QUESTIONS) {
      const ans = askClaude(requested, q.prompt, { effort: opts.effort });
      if (ans.resolvedModel) resolved = ans.resolvedModel;
      if (ans.ttftMs != null) ttfts.push(ans.ttftMs);
      const graded = gradeAnswer(q.prompt, q.reference, ans.result);
      const score = graded.score == null ? 0 : graded.score;
      questions.push({
        id: q.id,
        title: q.title,
        prompt: q.prompt,
        answer: (ans.result || '').slice(0, 700),
        score,
        ttftMs: ans.ttftMs,
        error: ans.error,
      });
      process.stdout.write(`  ${q.id.padEnd(16)} ${String(score).padStart(3)}\n`);
      await sleep(CALL_DELAY_MS);
    }

    const qualityScore = round1(mean(questions.map((x) => x.score)));
    const avgTtft = ttfts.length ? Math.round(mean(ttfts)) : null;

    // Baseline: accumulate first BASELINE_RUNS runs, lock; center = MEDIAN (robust).
    const b =
      baselines.models[resolved] ||
      (baselines.models[resolved] = { requested, samples: [], locked: false });
    b.requested = requested;
    if (!b.locked) {
      b.samples.push({ runId, qualityScore, ttftMean: avgTtft });
      const qs = b.samples.map((s) => s.qualityScore);
      const tt = b.samples.map((s) => s.ttftMean).filter((x) => x != null);
      b.qualityScore = { median: round1(median(qs)), std: round1(std(qs)) };
      b.ttftMs = { median: tt.length ? Math.round(median(tt)) : null };
      if (b.samples.length >= BASELINE_RUNS) b.locked = true;
    }
    const cond = condition(qualityScore, avgTtft ?? 0, b);
    const baseTxt = b.locked ? `${b.qualityScore.median}` : `forming ${b.samples.length}/${baselines.baselineRuns || BASELINE_RUNS}`;
    console.log(`  → 지능 ${qualityScore}/100  (baseline ${baseTxt})  ${cond.status}  ttft ${avgTtft ?? '–'}ms`);

    modelsOut.push({
      requested, resolved, qualityScore,
      avgTtftMs: avgTtft,
      byQuestion: Object.fromEntries(questions.map((x) => [x.id, x.score])),
      baseline: {
        qMedian: b.qualityScore ? b.qualityScore.median : null,
        qStd: b.qualityScore ? b.qualityScore.std : null,
        ttftMedian: b.ttftMs ? b.ttftMs.median : null,
        locked: b.locked,
        n: b.samples.length,
      },
      condition: cond,
      questions,
    });
  }

  const finishedAt = nowIso();
  const run = {
    runId, startedAt, finishedAt, profile: PROFILE, answerEffort: opts.effort, judgeModel: JUDGE_MODEL,
    systemPrompt: SYSTEM_PROMPT, models: modelsOut,
  };
  writeJson(path.join(RUNS_DIR, `${runId}.json`), run);
  writeJson(LATEST_FILE, run);
  writeJson(BASELINE_FILE, baselines);

  const history = readJson(HISTORY_FILE, { updatedAt: null, models: [], questions: QUESTION_IDS, runs: [] });
  const byModel = {};
  for (const m of modelsOut) {
    byModel[m.resolved] = {
      requested: m.requested, qualityScore: m.qualityScore, avgTtftMs: m.avgTtftMs,
      byQuestion: m.byQuestion, baseline: m.baseline, condition: m.condition,
    };
  }
  history.runs.push({ runId, startedAt, profile: PROFILE, answerEffort: opts.effort, byModel });
  history.models = [...new Set([...(history.models || []), ...modelsOut.map((m) => m.resolved)])];
  history.questions = QUESTION_IDS;
  history.updatedAt = finishedAt;
  writeJson(HISTORY_FILE, history);

  writeJson(META_FILE, {
    updatedAt: finishedAt, profile: PROFILE, answerEffort: opts.effort, judgeModel: JUDGE_MODEL,
    baselineRuns: baselines.baselineRuns || BASELINE_RUNS, systemPrompt: SYSTEM_PROMPT,
    questions: QUALITY_QUESTIONS.map((q) => ({ id: q.id, title: q.title })),
  });

  console.log(`\n✔ run ${runId} written; history holds ${history.runs.length} run(s)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
