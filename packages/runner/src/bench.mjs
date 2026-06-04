#!/usr/bin/env node
// Benchmark orchestrator.
//
//   node src/bench.mjs [--models opus,sonnet,haiku] [--repeat 5]
//                      [--effort high] [--only counting,math | --only crt-widgets]
//
// Drives every (model × question × repeat) call sequentially through the
// subscription, scores it, and writes:
//   data/runs/<runId>.json   full detail for one run
//   data/latest.json         copy of the most recent run (drill-down table)
//   data/history.json        compact time-series (the charts)
//   data/meta.json           question catalog + profile description

import fs from 'node:fs';
import path from 'node:path';

import { QUESTIONS, DIMENSIONS } from './questions.mjs';
import { verify } from './verify.mjs';
import { askClaude } from './claude.mjs';
import { summarizeQuestion, summarizeModel } from './score.mjs';
import {
  DATA_DIR, RUNS_DIR, HISTORY_FILE, LATEST_FILE, META_FILE,
  DEFAULT_MODELS, DEFAULT_REPEAT, DEFAULT_EFFORT, PROFILE, SYSTEM_PROMPT, CALL_DELAY_MS,
} from './config.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();

function parseArgs(argv) {
  const out = { models: DEFAULT_MODELS, repeat: DEFAULT_REPEAT, effort: DEFAULT_EFFORT, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--models') out.models = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--repeat') out.repeat = Math.max(1, parseInt(argv[++i], 10) || DEFAULT_REPEAT);
    else if (a === '--effort') out.effort = argv[++i];
    else if (a === '--only') out.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function makeRunId() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${ts}-${suffix}`;
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};
const writeJson = (file, obj) => fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');

const HELP = `Claude Intelligence Monitor — benchmark runner

Usage: node src/bench.mjs [options]
  --models <a,b,c>   models to test (aliases or full ids). default: ${DEFAULT_MODELS.join(',')}
  --repeat <n>       attempts per question. default: ${DEFAULT_REPEAT}
  --effort <level>   PINNED effort (low|medium|high|xhigh|max). default: ${DEFAULT_EFFORT}
  --only <list>      restrict to dimensions or question ids (comma-separated)
  -h, --help         show this help
`;

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(HELP);
    return;
  }

  const questions = opts.only
    ? QUESTIONS.filter((q) => opts.only.includes(q.dimension) || opts.only.includes(q.id))
    : QUESTIONS;

  if (questions.length === 0) {
    console.error(`No questions match --only ${opts.only?.join(',')}`);
    process.exit(1);
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true });

  const runId = makeRunId();
  const startedAt = nowIso();
  const totalCalls = opts.models.length * questions.length * opts.repeat;
  console.log(`\n▶ Claude Intelligence Monitor — run ${runId}`);
  console.log(
    `  profile=${PROFILE} effort=${opts.effort} repeat=${opts.repeat} ` +
      `models=${opts.models.join(',')} questions=${questions.length} → ${totalCalls} calls\n`
  );

  const modelsOut = [];
  for (const model of opts.models) {
    console.log(`◆ ${model}`);
    const qSummaries = [];
    let resolvedModel = model;

    for (const q of questions) {
      const attempts = [];
      process.stdout.write(`  ${q.id.padEnd(24)} `);
      for (let r = 0; r < opts.repeat; r++) {
        const res = askClaude(model, q.prompt, { effort: opts.effort });
        if (res.resolvedModel) resolvedModel = res.resolvedModel;
        let parsed = null;
        let correct = false;
        if (res.ok) {
          const v = verify(q.verify, res.result);
          parsed = v.parsed;
          correct = v.correct;
        }
        attempts.push({
          raw: res.result,
          parsed,
          correct,
          ttftMs: res.ttftMs,
          durationMs: res.durationMs,
          outputTokens: res.outputTokens,
          stopReason: res.stopReason,
          error: res.error,
        });
        process.stdout.write(correct ? '✓' : res.ok ? '✗' : '!');
        if (r < opts.repeat - 1 || q !== questions[questions.length - 1]) await sleep(CALL_DELAY_MS);
      }
      const qs = summarizeQuestion(q, attempts);
      qSummaries.push(qs);
      console.log(`  ${(qs.passRate * 100).toFixed(0).padStart(3)}%  modal="${qs.modalAnswer}"`);
    }

    const summary = summarizeModel(qSummaries);
    console.log(
      `  → index ${summary.index}/100   consistency ${(summary.consistency * 100).toFixed(0)}%   ` +
        `ttft ${summary.avgTtftMs ?? '–'}ms   out ${summary.avgOutputTokens ?? '–'}tok\n`
    );
    modelsOut.push({ requested: model, resolved: resolvedModel, ...summary, questions: qSummaries });
  }

  const finishedAt = nowIso();
  const run = {
    runId,
    startedAt,
    finishedAt,
    profile: PROFILE,
    effort: opts.effort,
    repeat: opts.repeat,
    systemPrompt: SYSTEM_PROMPT,
    models: modelsOut,
  };

  // Full run detail + "latest" pointer.
  writeJson(path.join(RUNS_DIR, `${runId}.json`), run);
  writeJson(LATEST_FILE, run);

  // Append to the compact time-series.
  const history = readJson(HISTORY_FILE, { updatedAt: null, models: [], dimensions: DIMENSIONS, runs: [] });
  const byModel = {};
  for (const m of modelsOut) {
    byModel[m.resolved] = {
      requested: m.requested,
      index: m.index,
      consistency: m.consistency,
      avgTtftMs: m.avgTtftMs,
      avgOutputTokens: m.avgOutputTokens,
      dimensions: m.dimensions,
    };
  }
  history.runs.push({ runId, startedAt, profile: PROFILE, effort: opts.effort, repeat: opts.repeat, byModel });
  history.models = [...new Set([...(history.models || []), ...modelsOut.map((m) => m.resolved)])];
  history.dimensions = DIMENSIONS;
  history.updatedAt = finishedAt;
  writeJson(HISTORY_FILE, history);

  // Question catalog for the dashboard.
  writeJson(META_FILE, {
    updatedAt: finishedAt,
    profile: PROFILE,
    defaultEffort: DEFAULT_EFFORT,
    systemPrompt: SYSTEM_PROMPT,
    dimensions: DIMENSIONS,
    questions: QUESTIONS.map((q) => ({
      id: q.id,
      dimension: q.dimension,
      title: q.title,
      prompt: q.prompt,
      verify: q.verify,
    })),
  });

  console.log(`✔ ${path.relative(DATA_DIR, path.join(RUNS_DIR, runId + '.json'))} written`);
  console.log(`✔ history now holds ${history.runs.length} run(s)\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
