// Reasoning-QUALITY judge (the resolution half of the hybrid).
//
// Objective correctness can't separate healthy frontier models — they all ace it. What
// people perceive as "smart vs dumb" is reasoning QUALITY, which only an LLM judge can
// score. So for each dimension we take the model's worked answer to the hardest ladder
// problem and have an independent Opus judge rate it 0-100 (reference-guided: we already
// computed the true answer, so the judge grades correctness + clarity + rigor, not vibes).
//
// This is for DISPLAY/discrimination. The hard degradation verdict comes from the
// objective ladder, so a little judge bias here is acceptable (and each model is tracked
// vs its OWN peak, which cancels any constant bias).

import { askClaude } from './claude.mjs';

export const JUDGE_MODEL = 'opus';
const JUDGE_EFFORT = 'low';

// Grade one worked answer 0-100 against the known-correct reference.
//
// CRITICAL: correctness-anchored, NOT verbosity-rewarding. Naive "rate the reasoning
// quality" inverts the ranking — a terse-but-correct Opus answer looks worse than a
// rambling Haiku one. So a correct final answer floors at ~90 regardless of how little
// work is shown; spread within 90-100 comes only from genuine clarity/validity, and low
// scores require an actually WRONG answer.
export function judgeQuality(questionPrompt, reference, answerText) {
  const answer = (answerText || '').slice(0, 1800);
  const judgePrompt =
    `당신은 채점관입니다. 이 문제의 정답은 ${reference} 입니다. 학생 풀이를 0~100 정수로 채점하되 다음을 엄격히 지키세요.\n` +
    `1) 먼저 학생의 '최종 답'이 정답 ${reference}와 일치하는지 확인하세요.\n` +
    `2) 일치하면: 기본 90점에서 시작합니다. 풀이가 짧거나 과정을 적게 써도 절대 감점하지 마세요(정답을 맞힌 것이 가장 중요). ` +
    `보이는 논리가 명확하고 타당하면 95~100, 보이는 풀이에 실제 오류나 비약이 있으면 88~92로 주세요.\n` +
    `3) 불일치하면: 접근은 맞고 계산만 틀렸으면 40~55, 완전히 틀렸으면 0~30.\n` +
    `길게 썼다고 점수를 더 주면 안 됩니다. 오직 0~100 사이 정수 하나만 출력하세요.\n\n` +
    `[문제]\n${questionPrompt}\n\n[학생 풀이]\n${answer}`;
  const r = askClaude(JUDGE_MODEL, judgePrompt, { effort: JUDGE_EFFORT });
  const m = (r.result || '').match(/\b(\d{1,3})\b/);
  if (!m) return { score: 0, error: r.error || 'no-number' };
  const score = Math.max(0, Math.min(100, parseInt(m[1], 10)));
  return { score, error: r.error };
}
