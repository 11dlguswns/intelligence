// Intelligence score = an independent Opus judge grading answer QUALITY (0-100) on
// hard open-ended questions. Hard reasoning DOES discriminate the models (a probe
// showed haiku botching the 12-ball weighing puzzle -> 0, while opus/sonnet ~95),
// even though objective accuracy is at ceiling.

import { askClaude } from './claude.mjs';
import { JUDGE_EFFORT } from './config.mjs';

export const JUDGE_MODEL = 'opus';

// Weighted toward hard reasoning where weaker/degraded models slip. Opus (the judge)
// reliably knows the correct answers to all of these, so its grading is trustworthy.
export const QUALITY_QUESTIONS = [
  {
    id: 'weigh12',
    title: '12-ball weighing (3 weighings)',
    prompt:
      'You have 12 identical-looking balls; exactly one is a different weight (it could be heavier OR lighter). Using a balance scale only 3 times, give a strategy that ALWAYS identifies the odd ball and whether it is heavier or lighter. Explain the full procedure for every outcome.',
  },
  {
    id: 'prob-tuesday',
    title: 'Boy-girl-Tuesday probability',
    prompt:
      'A family has two children. You are told at least one is a boy born on a Tuesday. What is the exact probability that both children are boys? Give the fraction and explain the reasoning carefully.',
  },
  {
    id: 'knaves',
    title: 'Knights and knaves',
    prompt:
      'Knights always tell the truth; knaves always lie. You meet A, B, C. A says "B is a knave." B says "A and C are the same type." C says "B is a knight." Determine the type of each, with full reasoning.',
  },
  {
    id: 'pct-trap',
    title: 'Percent increase/discount trap',
    prompt:
      'A $100 item is increased by 10%, then the new price is discounted by 10%. A customer claims the price is back to $100. Compute the exact final price and explain whether the customer is right.',
  },
  {
    id: 'fake-proof',
    title: 'Find the flaw in a 2=1 proof',
    prompt:
      'Find the exact error in this "proof" that 2 = 1: Let a = b. Then a^2 = ab, so a^2 - b^2 = ab - b^2, i.e. (a+b)(a-b) = b(a-b). Dividing both sides by (a-b) gives a+b = b, and since a = b, 2b = b, so 2 = 1. Identify the precise invalid step and why.',
  },
  {
    id: 'fermi-pingpong',
    title: 'Estimate ping-pong balls in a 737',
    prompt:
      'Estimate how many ping-pong balls would fit inside a Boeing 737 cabin. Show your decomposition, assumptions, and arithmetic.',
  },
  {
    id: 'hens-eggs',
    title: 'Hens and eggs rate trap',
    prompt:
      'If a hen and a half lays an egg and a half in a day and a half, how many eggs do 6 hens lay in 6 days? Show the rate reasoning step by step.',
  },
  {
    id: 'cube-2faces',
    title: 'Painted 3x3x3 cube',
    prompt:
      'A 3x3x3 cube has all its outer faces painted, then is cut into 27 unit cubes. Exactly how many of the unit cubes have paint on exactly two faces? Explain.',
  },
  {
    id: 'rooks',
    title: 'Non-attacking rooks',
    prompt:
      'In how many distinct ways can 8 rooks be placed on a standard 8x8 chessboard so that no two attack each other? Give the number and explain why.',
  },
  {
    id: 'monty',
    title: 'Monty Hall',
    prompt:
      'In the Monty Hall problem (3 doors, one car), you pick a door, the host opens a different door revealing a goat, and offers you the switch. Should you switch? Give the exact win probabilities for staying vs switching and explain.',
  },
];

const judgePrompt = (q, a) =>
  `You are a strict, expert grader. First work out the correct answer yourself, then grade the candidate answer below.\n\n` +
  `QUESTION:\n${q}\n\nCANDIDATE ANSWER:\n${a}\n\n` +
  `Grade the candidate on correctness, reasoning rigor, and clarity from 0 to 100. Be critical and use the full range: a wrong or badly flawed answer below 40, an incomplete or partly-right one 40-70, and only a fully correct, rigorous answer above 88. Respond with ONLY the integer score.`;

/** Grade one answer with the Opus judge. Returns { score, resolvedJudge }. */
export function gradeAnswer(question, answer) {
  const res = askClaude(JUDGE_MODEL, judgePrompt(question, answer || '(no answer)'), { effort: JUDGE_EFFORT });
  const m = String(res.result ?? '').match(/\d{1,3}/);
  const score = m ? Math.max(0, Math.min(100, Number(m[0]))) : null;
  return { score, resolvedJudge: res.resolvedModel, ok: res.ok };
}

export const QUESTION_IDS = QUALITY_QUESTIONS.map((q) => q.id);
