// Intelligence score = an independent Opus judge grading answer QUALITY (0-100) on
// hard questions, grouped into evaluation DIMENSIONS (reasoning, math, probability,
// spatial, estimation, knowledge). Reference-guided grading + rubric for accuracy.

import { askClaude } from './claude.mjs';
import { JUDGE_EFFORT } from './config.mjs';

export const JUDGE_MODEL = 'opus';

// dimension keys -> Korean labels are mapped in the dashboard.
export const DIMENSIONS = ['reasoning', 'math', 'probability', 'spatial', 'estimation', 'knowledge'];

export const QUALITY_QUESTIONS = [
  {
    id: 'weigh12', dimension: 'reasoning', title: '12-ball weighing',
    prompt:
      'You have 12 identical-looking balls; exactly one is a different weight (it could be heavier OR lighter). Using a balance scale only 3 times, give a strategy that ALWAYS identifies the odd ball and whether it is heavier or lighter. Explain the full procedure for every outcome.',
    reference: 'A correct, complete 3-weighing procedure (e.g. weigh {1-4} vs {5-8}; handle balanced and unbalanced branches with careful regrouping) that identifies the odd ball AND heavier/lighter in every case. Vague or incomplete = wrong.',
  },
  {
    id: 'knaves', dimension: 'reasoning', title: 'Knights and knaves',
    prompt:
      'Knights always tell the truth; knaves always lie. You meet A, B, C. A says "B is a knave." B says "A and C are the same type." C says "B is a knight." Determine the type of each, with full reasoning.',
    reference: 'Correct: A = knight, B = knave, C = knave (the unique consistent assignment).',
  },
  {
    id: 'pct-trap', dimension: 'math', title: 'Percent increase/discount',
    prompt:
      'A $100 item is increased by 10%, then the new price is discounted by 10%. A customer claims the price is back to $100. Compute the exact final price and explain whether the customer is right.',
    reference: 'Correct: $99 (100 × 1.1 × 0.9 = 99). The customer is WRONG — $1 lower, not back to $100.',
  },
  {
    id: 'hens-eggs', dimension: 'math', title: 'Hens and eggs rate',
    prompt:
      'If a hen and a half lays an egg and a half in a day and a half, how many eggs do 6 hens lay in 6 days? Show the rate reasoning step by step.',
    reference: 'Correct: 24. (1.5 hens lay 1.5 eggs in 1.5 days ⇒ 1 hen = 2/3 egg/day; 6 × 6 × 2/3 = 24.)',
  },
  {
    id: 'fake-proof', dimension: 'math', title: 'Flaw in a 2=1 proof',
    prompt:
      'Find the exact error in this "proof" that 2 = 1: Let a = b. Then a^2 = ab, so a^2 - b^2 = ab - b^2, i.e. (a+b)(a-b) = b(a-b). Dividing both sides by (a-b) gives a+b = b, and since a = b, 2b = b, so 2 = 1. Identify the precise invalid step and why.',
    reference: 'Correct: dividing by (a − b) = 0 (since a = b) is invalid (division by zero).',
  },
  {
    id: 'prob-tuesday', dimension: 'probability', title: 'Boy-girl-Tuesday',
    prompt:
      'A family has two children. You are told at least one is a boy born on a Tuesday. What is the exact probability that both children are boys? Give the fraction and explain.',
    reference: 'Correct: 13/27.',
  },
  {
    id: 'monty', dimension: 'probability', title: 'Monty Hall',
    prompt:
      'In the Monty Hall problem (3 doors, one car), you pick a door, the host opens a different door revealing a goat, and offers the switch. Should you switch? Give the exact win probabilities for staying vs switching and explain.',
    reference: 'Correct: SWITCH. Staying wins 1/3, switching wins 2/3.',
  },
  {
    id: 'cube-2faces', dimension: 'spatial', title: 'Painted 3x3x3 cube',
    prompt:
      'A 3x3x3 cube has all its outer faces painted, then is cut into 27 unit cubes. Exactly how many of the unit cubes have paint on exactly two faces? Explain.',
    reference: 'Correct: 12 — the edge cubes (12 edges × 1 each).',
  },
  {
    id: 'rooks', dimension: 'spatial', title: 'Non-attacking rooks',
    prompt:
      'In how many distinct ways can 8 rooks be placed on a standard 8x8 chessboard so that no two attack each other? Give the number and explain why.',
    reference: 'Correct: 8! = 40320 (one rook per row and column = a permutation).',
  },
  {
    id: 'fermi-pingpong', dimension: 'estimation', title: 'Ping-pong balls in a 737',
    prompt:
      'Estimate how many ping-pong balls would fit inside a Boeing 737 cabin. Show your decomposition, assumptions, and arithmetic.',
    reference: 'No single number; grade the REASONING. ~10–50 million is sound (cabin ~120–180 m³ ÷ ball ~33.5 cm³ × ~70% packing). Reward clear decomposition + consistent arithmetic; penalize unsupported guesses.',
  },
  {
    id: 'estimate-library', dimension: 'estimation', title: 'Weight of books in a library',
    prompt:
      'Estimate the total weight, in kilograms, of all the books in a typical large public library. Show your assumptions and arithmetic step by step.',
    reference: 'No single number; grade the REASONING. ~100–500 tonnes is reasonable (e.g. ~500k books × ~0.5 kg ≈ 250,000 kg). Reward a clear book-count × per-book-weight decomposition with consistent arithmetic.',
  },
  {
    id: 'know-pi', dimension: 'knowledge', title: 'Digits of pi',
    prompt: 'What are the first 8 digits of the number pi (including the leading 3)? Respond as 3.xxxxxxx.',
    reference: 'Correct: 3.1415926 (digits 3,1,4,1,5,9,2,6).',
  },
  {
    id: 'know-relativity', dimension: 'knowledge', title: 'General relativity',
    prompt: 'Who developed the theory of general relativity, and in what year was it first published? Also state the famous equation relating energy and mass.',
    reference: 'Correct: Albert Einstein; general relativity published 1915; E = mc^2.',
  },
];

const judgePrompt = (q, ref, a) =>
  `You are a strict, expert grader. Grade the candidate answer against the reference.\n\n` +
  `QUESTION:\n${q}\n\nREFERENCE (correct answer / key points):\n${ref}\n\nCANDIDATE ANSWER:\n${a}\n\n` +
  `Score 0-100 based ONLY on: (1) correctness vs the reference — most important, (2) reasoning soundness, (3) clarity. Do NOT reward length; a concise correct answer beats a long vague one. Guide: fully correct + valid reasoning 90-100; correct answer weak reasoning 70-89; partially correct 40-69; wrong/flawed below 40. Respond with ONLY the integer score.`;

export function gradeAnswer(question, reference, answer) {
  const res = askClaude(JUDGE_MODEL, judgePrompt(question, reference, answer || '(no answer)'), { effort: JUDGE_EFFORT });
  const m = String(res.result ?? '').match(/\d{1,3}/);
  const score = m ? Math.max(0, Math.min(100, Number(m[0]))) : null;
  return { score, resolvedJudge: res.resolvedModel, ok: res.ok };
}

export const QUESTION_IDS = QUALITY_QUESTIONS.map((q) => q.id);
