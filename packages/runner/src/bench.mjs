#!/usr/bin/env node
// Intelligence-score run. Every run SYNTHESIZES a fresh DIFFICULTY LADDER: each of 6
// dimensions is probed at easy/medium/hard levels, and the dimension score is a
// level-weighted pass rate (harder levels weigh more) — i.e. HOW FAR UP THE LADDER the
// model got before breaking. This discriminates models that all ceiling on fixed
// difficulty, and a weakened model breaks one level earlier. Answers are computed in code
// and exact-graded (no LLM judge). Tracked vs each model's OWN peak (a drop = it got dumber).
//
//   node src/bench.mjs [--models opus,sonnet,haiku] [--effort medium]

import fs from 'node:fs';
import path from 'node:path';

import { generateLadder, gradeInstance, formatAnswer, LEVEL_WEIGHT, DIMENSIONS, DIM_TITLE } from './problems.mjs';
import { judgeQuality, JUDGE_MODEL } from './quality.mjs';
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

  // Synthesize this run's difficulty ladder ONCE so every model faces the IDENTICAL set.
  const ladder = generateLadder(runId);

  console.log(`\n▶ Intelligence run ${runId} — effort=${opts.effort} · ${ladder.length} dims × levels ${ladder[0].levels.map((l) => l.level).join('/')} (find-the-breaking-point) · models=${opts.models.join(',')}`);

  const modelsOut = [];
  for (const requested of opts.models) {
    console.log(`\n◆ ${requested}`);
    let resolved = requested;
    const questions = [];
    const ttfts = [];

    for (const dimItem of ladder) {
      // OBJECTIVE: probe each difficulty level (level-weighted pass rate = how far up the
      // ladder the model got = degradation-sensitive health signal, contamination-proof).
      const levelResults = [];
      for (const inst of dimItem.levels) {
        const ans = askClaude(requested, inst.prompt, { effort: opts.effort });
        if (ans.resolvedModel) resolved = ans.resolvedModel;
        if (ans.ttftMs != null) ttfts.push(ans.ttftMs);
        const sc = gradeInstance(inst, ans.result);
        levelResults.push({
          level: inst.level,
          score: sc,
          full: ans.result || '',
          answer: (ans.result || '').slice(0, 500),
          correct: formatAnswer(inst),
          prompt: inst.prompt,
          error: ans.error,
        });
        await sleep(CALL_DELAY_MS);
      }
      let num = 0,
        den = 0;
      for (const lr of levelResults) {
        const w = LEVEL_WEIGHT[lr.level];
        den += w;
        num += w * lr.score;
      }
      const objScore = Math.round(num / den);
      const hardest = levelResults[levelResults.length - 1];
      // QUALITY: an independent Opus judge rates the worked answer to the HARDEST problem
      // 0-100 (reference-guided). This separates models that all ace correctness.
      const qRaw = judgeQuality(hardest.prompt, hardest.correct, hardest.full).score;
      // We ALREADY know from exact grading whether the hardest answer is right. Use that to
      // floor correct answers (judge noise must not tank a provably-correct solution) and
      // cap wrong ones — so quality = clarity spread on top of ground-truth correctness.
      const l6correct = hardest.score >= 60;
      const qScore = l6correct ? Math.max(qRaw, 88) : Math.min(qRaw, 70);
      const levelInfo = levelResults.map((lr) => `L${lr.level}${lr.score >= 60 ? '✓' : '✗'}`).join(' ');
      questions.push({
        id: dimItem.dim,
        dimension: dimItem.dim,
        title: dimItem.title,
        prompt: hardest.prompt,
        correct: hardest.correct,
        answer: hardest.answer,
        score: qScore, // quality (display)
        objScore, // objective ladder (health)
        levelInfo,
        levels: levelResults.map((lr) => ({ level: lr.level, score: lr.score })),
        ttftMs: null,
        error: hardest.error,
      });
      await sleep(CALL_DELAY_MS);
      process.stdout.write(`  ${dimItem.dim.padEnd(14)} 품질 ${String(qScore).padStart(3)}  객관 ${String(objScore).padStart(3)}  (${levelInfo})\n`);
    }

    const qualityScore = round1(mean(questions.map((x) => x.score)));
    const objHealth = round1(mean(questions.map((x) => x.objScore)));
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
    console.log(`  → 품질 ${qualityScore}/100  객관건강도 ${objHealth}  (baseline ${baseTxt})  ${cond.status}`);

    modelsOut.push({
      requested, resolved, qualityScore, objHealth,
      avgTtftMs: avgTtft,
      byQuestion: Object.fromEntries(questions.map((x) => [x.id, x.score])),
      byObjective: Object.fromEntries(questions.map((x) => [x.id, x.objScore])),
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

  const history = readJson(HISTORY_FILE, { updatedAt: null, models: [], questions: DIMENSIONS, runs: [] });
  const byModel = {};
  for (const m of modelsOut) {
    byModel[m.resolved] = {
      requested: m.requested, qualityScore: m.qualityScore, objHealth: m.objHealth, avgTtftMs: m.avgTtftMs,
      byQuestion: m.byQuestion, byObjective: m.byObjective, baseline: m.baseline, condition: m.condition,
    };
  }
  history.runs.push({ runId, startedAt, profile: PROFILE, answerEffort: opts.effort, byModel });
  history.models = [...new Set([...(history.models || []), ...modelsOut.map((m) => m.resolved)])];
  history.questions = DIMENSIONS;
  history.updatedAt = finishedAt;
  writeJson(HISTORY_FILE, history);

  writeJson(META_FILE, {
    updatedAt: finishedAt, profile: PROFILE, answerEffort: opts.effort, judgeModel: JUDGE_MODEL, scoring: 'hybrid',
    baselineRuns: baselines.baselineRuns || BASELINE_RUNS, systemPrompt: SYSTEM_PROMPT,
    ladderLevels: ladder[0].levels.map((l) => l.level),
    questions: DIMENSIONS.map((d) => ({ id: d, title: DIM_TITLE[d], dimension: d })),
  });

  console.log(`\n✔ run ${runId} written; history holds ${history.runs.length} run(s)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
