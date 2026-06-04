// Intelligence score = an independent Opus judge grading answer QUALITY (0-100) on
// hard open-ended questions. Research-backed accuracy improvements applied:
//   - REFERENCE-guided grading: the judge is given the correct answer/key points, so
//     it checks against a known reference instead of re-deriving (far more accurate +
//     consistent).  [labelyourdata, arXiv 2412.12509]
//   - explicit rubric + anti-verbosity (don't reward length).  [sebastiansigl, biases]

import { askClaude } from './claude.mjs';
import { JUDGE_EFFORT } from './config.mjs';

export const JUDGE_MODEL = 'opus';

// Each question carries a `reference`: the correct answer + the key points a good answer
// must contain. Opus reliably knows these, but giving them explicitly removes judge noise.
export const QUALITY_QUESTIONS = [
  {
    id: 'weigh12',
    title: '12-ball weighing (3 weighings)',
    prompt:
      'You have 12 identical-looking balls; exactly one is a different weight (it could be heavier OR lighter). Using a balance scale only 3 times, give a strategy that ALWAYS identifies the odd ball and whether it is heavier or lighter. Explain the full procedure for every outcome.',
    reference:
      'A correct, complete 3-weighing procedure. Standard solution: weigh {1,2,3,4} vs {5,6,7,8}. If balanced, the odd ball is in {9,10,11,12} and two more weighings isolate it and its heavy/light status. If unbalanced, careful regrouping in weighings 2 and 3 (rotating/swapping balls between pans and aside) identifies the odd ball AND whether heavier or lighter in every branch. Must cover all branches; a vague or incomplete procedure is wrong.',
  },
  {
    id: 'prob-tuesday',
    title: 'Boy-girl-Tuesday probability',
    prompt:
      'A family has two children. You are told at least one is a boy born on a Tuesday. What is the exact probability that both children are boys? Give the fraction and explain the reasoning carefully.',
    reference: 'Correct answer: 13/27. (Enumerate (gender, weekday) pairs for two children conditioned on at least one boy-born-Tuesday.)',
  },
  {
    id: 'knaves',
    title: 'Knights and knaves',
    prompt:
      'Knights always tell the truth; knaves always lie. You meet A, B, C. A says "B is a knave." B says "A and C are the same type." C says "B is a knight." Determine the type of each, with full reasoning.',
    reference: 'Correct answer: A = knight, B = knave, C = knave (the unique consistent assignment).',
  },
  {
    id: 'pct-trap',
    title: 'Percent increase/discount trap',
    prompt:
      'A $100 item is increased by 10%, then the new price is discounted by 10%. A customer claims the price is back to $100. Compute the exact final price and explain whether the customer is right.',
    reference: 'Correct answer: $99 (100 × 1.1 × 0.9 = 99). The customer is WRONG — it is $1 lower, not back to $100.',
  },
  {
    id: 'fake-proof',
    title: 'Find the flaw in a 2=1 proof',
    prompt:
      'Find the exact error in this "proof" that 2 = 1: Let a = b. Then a^2 = ab, so a^2 - b^2 = ab - b^2, i.e. (a+b)(a-b) = b(a-b). Dividing both sides by (a-b) gives a+b = b, and since a = b, 2b = b, so 2 = 1. Identify the precise invalid step and why.',
    reference: 'Correct answer: the error is dividing both sides by (a − b), which equals 0 because a = b. Division by zero is invalid, so the step a+b = b does not follow.',
  },
  {
    id: 'fermi-pingpong',
    title: 'Estimate ping-pong balls in a 737',
    prompt:
      'Estimate how many ping-pong balls would fit inside a Boeing 737 cabin. Show your decomposition, assumptions, and arithmetic.',
    reference:
      'No single right number; grade the REASONING. A sound estimate ~10–50 million (cabin volume ~120–180 m³; ping-pong ball ~33.5 cm³; ~65–74% packing efficiency → tens of millions). Reward a clear decomposition (cabin volume / ball volume × packing factor) with consistent arithmetic; penalize unsupported guesses or arithmetic errors.',
  },
  {
    id: 'hens-eggs',
    title: 'Hens and eggs rate trap',
    prompt:
      'If a hen and a half lays an egg and a half in a day and a half, how many eggs do 6 hens lay in 6 days? Show the rate reasoning step by step.',
    reference: 'Correct answer: 24. (1.5 hens lay 1.5 eggs in 1.5 days ⇒ 1 hen lays 2/3 egg per day; 6 hens × 6 days × 2/3 = 24.)',
  },
  {
    id: 'cube-2faces',
    title: 'Painted 3x3x3 cube',
    prompt:
      'A 3x3x3 cube has all its outer faces painted, then is cut into 27 unit cubes. Exactly how many of the unit cubes have paint on exactly two faces? Explain.',
    reference: 'Correct answer: 12 — the edge cubes (a cube has 12 edges, each contributing exactly one unit cube with two painted faces).',
  },
  {
    id: 'rooks',
    title: 'Non-attacking rooks',
    prompt:
      'In how many distinct ways can 8 rooks be placed on a standard 8x8 chessboard so that no two attack each other? Give the number and explain why.',
    reference: 'Correct answer: 8! = 40320 (one rook per row and per column = a permutation of columns).',
  },
  {
    id: 'monty',
    title: 'Monty Hall',
    prompt:
      'In the Monty Hall problem (3 doors, one car), you pick a door, the host opens a different door revealing a goat, and offers you the switch. Should you switch? Give the exact win probabilities for staying vs switching and explain.',
    reference: 'Correct answer: SWITCH. Staying wins 1/3, switching wins 2/3.',
  },
];

const judgePrompt = (q, ref, a) =>
  `You are a strict, expert grader. Grade the candidate answer against the reference.\n\n` +
  `QUESTION:\n${q}\n\n` +
  `REFERENCE (correct answer / key points):\n${ref}\n\n` +
  `CANDIDATE ANSWER:\n${a}\n\n` +
  `Score 0-100 based ONLY on: (1) correctness vs the reference — most important, (2) soundness of the reasoning, (3) clarity. Do NOT reward length: a concise correct answer must score higher than a long vague or padded one. Scoring guide: fully correct with valid reasoning 90-100; correct final answer but weak/incomplete reasoning 70-89; partially correct or right idea wrong execution 40-69; wrong or fundamentally flawed below 40. Respond with ONLY the integer score.`;

/** Grade one answer with the reference-guided Opus judge. Returns { score, resolvedJudge }. */
export function gradeAnswer(question, reference, answer) {
  const res = askClaude(JUDGE_MODEL, judgePrompt(question, reference, answer || '(no answer)'), { effort: JUDGE_EFFORT });
  const m = String(res.result ?? '').match(/\d{1,3}/);
  const score = m ? Math.max(0, Math.min(100, Number(m[0]))) : null;
  return { score, resolvedJudge: res.resolvedModel, ok: res.ok };
}

export const QUESTION_IDS = QUALITY_QUESTIONS.map((q) => q.id);
