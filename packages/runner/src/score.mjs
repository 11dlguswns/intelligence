// Pure aggregation helpers: per-question summary, per-model index & consistency.

export const round1 = (n) => Math.round(n * 10) / 10;
export const round3 = (n) => Math.round(n * 1000) / 1000;

/** Most frequent value in a list, with its frequency in [0,1]. */
export function modal(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  let best = null;
  let bestN = 0;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return { value: best, freq: values.length ? bestN / values.length : 0 };
}

export function summarizeQuestion(q, attempts) {
  const passes = attempts.filter((a) => a.correct).length;
  const passRate = attempts.length ? passes / attempts.length : 0;
  const m = modal(attempts.map((a) => a.parsed ?? '∅'));
  return {
    id: q.id,
    dimension: q.dimension,
    title: q.title,
    passRate: round3(passRate),
    modalAnswer: m.value,
    modalFreq: round3(m.freq),
    attempts,
  };
}

/**
 * Roll up a model's per-question summaries into headline metrics.
 * Index is balanced: average pass-rate WITHIN each dimension, then average
 * ACROSS dimensions — so a dimension with more questions can't dominate.
 */
export function summarizeModel(questionSummaries) {
  const byDim = new Map();
  for (const qs of questionSummaries) {
    if (!byDim.has(qs.dimension)) byDim.set(qs.dimension, []);
    byDim.get(qs.dimension).push(qs.passRate);
  }
  const dimensions = {};
  for (const [d, rates] of byDim) {
    dimensions[d] = round3(rates.reduce((a, b) => a + b, 0) / rates.length);
  }
  const dimVals = Object.values(dimensions);
  const index = dimVals.length ? 100 * (dimVals.reduce((a, b) => a + b, 0) / dimVals.length) : 0;

  const consistency = questionSummaries.length
    ? questionSummaries.reduce((a, q) => a + q.modalFreq, 0) / questionSummaries.length
    : 0;

  const ttfts = questionSummaries.flatMap((q) => q.attempts.map((a) => a.ttftMs).filter((x) => x != null));
  const outs = questionSummaries.flatMap((q) => q.attempts.map((a) => a.outputTokens).filter((x) => x != null));
  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const avgTtft = avg(ttfts);
  const avgOut = avg(outs);

  return {
    index: round1(index),
    consistency: round3(consistency),
    avgTtftMs: avgTtft != null ? Math.round(avgTtft) : null,
    avgOutputTokens: avgOut != null ? Math.round(avgOut) : null,
    dimensions,
  };
}
