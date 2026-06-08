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
    let failedDims = 0;

    for (const dimItem of ladder) {
      // OBJECTIVE: probe each difficulty level (level-weighted pass rate = how far up the
      // ladder the model got = degradation-sensitive health signal, contamination-proof).
      const levelResults = [];
      for (const inst of dimItem.levels) {
        const ans = askClaude(requested, inst.prompt, { effort: opts.effort });
        if (ans.resolvedModel) resolved = ans.resolvedModel;
        if (ans.ttftMs != null) ttfts.push(ans.ttftMs);
        // A call that errored with an empty answer was NOT measured (server rate-limit /
        // overload after retries) — distinct from a real wrong answer. Mark it so it is
        // EXCLUDED from scoring rather than counted as 0 (which would fake a degradation).
        const failed = !!ans.error && !(ans.result && ans.result.trim());
        const sc = gradeInstance(inst, ans.result);
        levelResults.push({
          level: inst.level,
          score: sc,
          measured: !failed,
          full: ans.result || '',
          answer: (ans.result || '').slice(0, 500),
          correct: formatAnswer(inst),
          prompt: inst.prompt,
          error: ans.error,
        });
        await sleep(CALL_DELAY_MS);
      }
      const measured = levelResults.filter((lr) => lr.measured);
      const dimMeasured = measured.length > 0;
      let objScore = null;
      if (dimMeasured) {
        let num = 0,
          den = 0;
        for (const lr of measured) {
          const w = LEVEL_WEIGHT[lr.level];
          den += w;
          num += w * lr.score;
        }
        objScore = Math.round(num / den);
      }
      // Judge the hardest MEASURED answer (skip if nothing was measured this dimension).
      const hardest = dimMeasured ? measured[measured.length - 1] : levelResults[levelResults.length - 1];
      let qScore = null;
      if (dimMeasured) {
        const qRaw = judgeQuality(hardest.prompt, hardest.correct, hardest.full).score;
        // Ground-truth correctness floors/caps the judge so its noise can't invert ranking.
        const ok = hardest.score >= 60;
        qScore = ok ? Math.max(qRaw, 88) : Math.min(qRaw, 70);
      }
      const levelInfo = levelResults.map((lr) => (lr.measured ? `L${lr.level}${lr.score >= 60 ? '✓' : '✗'}` : `L${lr.level}⚠`)).join(' ');
      if (!dimMeasured) failedDims++;
      questions.push({
        id: dimItem.dim,
        dimension: dimItem.dim,
        title: dimItem.title,
        prompt: hardest.prompt,
        correct: hardest.correct,
        answer: hardest.answer,
        score: qScore, // quality (display); null if unmeasured
        objScore, // objective ladder (health); null if unmeasured
        measured: dimMeasured,
        levelInfo,
        levels: levelResults.map((lr) => ({ level: lr.level, score: lr.measured ? lr.score : null })),
        ttftMs: null,
        error: hardest.error,
      });
      await sleep(CALL_DELAY_MS);
      const qTxt = qScore == null ? ' ⚠ ' : String(qScore).padStart(3);
      const oTxt = objScore == null ? ' ⚠ ' : String(objScore).padStart(3);
      process.stdout.write(`  ${dimItem.dim.padEnd(14)} 품질 ${qTxt}  객관 ${oTxt}  (${levelInfo})\n`);
    }

    // Average over MEASURED dimensions only (unmeasured = null, excluded — never counted as 0).
    const qVals = questions.map((x) => x.score).filter((v) => v != null);
    const oVals = questions.map((x) => x.objScore).filter((v) => v != null);
    const qualityScore = qVals.length ? round1(mean(qVals)) : null;
    const objHealth = oVals.length ? round1(mean(oVals)) : null;
    const avgTtft = ttfts.length ? Math.round(mean(ttfts)) : null;
    const incomplete = failedDims > 0 || qualityScore == null;

    // Baseline: accumulate first BASELINE_RUNS runs, lock; center = MEDIAN (robust).
    // A run with ANY unmeasured dimension is NOT added to the baseline — a rate-limited
    // partial run must not lower the peak/baseline and later fake a recovery or a drop.
    const b =
      baselines.models[resolved] ||
      (baselines.models[resolved] = { requested, samples: [], locked: false });
    b.requested = requested;
    if (!b.locked && !incomplete) {
      b.samples.push({ runId, qualityScore, ttftMean: avgTtft });
      const qs = b.samples.map((s) => s.qualityScore);
      const tt = b.samples.map((s) => s.ttftMean).filter((x) => x != null);
      b.qualityScore = { median: round1(median(qs)), std: round1(std(qs)) };
      b.ttftMs = { median: tt.length ? Math.round(median(tt)) : null };
      if (b.samples.length >= BASELINE_RUNS) b.locked = true;
    }
    // An incomplete run can't be judged for degradation — report it as such, never 'degraded'.
    const cond = incomplete
      ? { status: 'incomplete', qDelta: null, latencyRatio: null }
      : condition(qualityScore, avgTtft ?? 0, b);
    const baseTxt = b.locked ? `${b.qualityScore.median}` : `forming ${b.samples.length}/${baselines.baselineRuns || BASELINE_RUNS}`;
    const warn = incomplete ? `  ⚠ ${failedDims}개 차원 측정실패(레이트리밋) — 집계제외` : '';
    console.log(`  → 품질 ${qualityScore ?? '–'}/100  객관건강도 ${objHealth ?? '–'}  (baseline ${baseTxt})  ${cond.status}${warn}`);

    modelsOut.push({
      requested, resolved, qualityScore, objHealth, incomplete, failedDims,
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
      requested: m.requested, qualityScore: m.qualityScore, objHealth: m.objHealth,
      incomplete: m.incomplete, failedDims: m.failedDims, avgTtftMs: m.avgTtftMs,
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
