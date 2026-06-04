// Parameterized problem FAMILIES with a difficulty "level" knob (1..N). Even with
// extended thinking, frontier models eventually break as level climbs — that's what
// lets calibration place each model in a sensitive ~85% band instead of the ceiling.
//
// generate(level, rng) -> { prompt, answer, score(raw) }. Answers computed in code.
// Parameters are capped so every reference value stays exact (< 2^53).

import { randint, choice, sampleDistinct, randDigits } from './rng.mjs';

const firstNumber = (text) => {
  const m = String(text ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const firstWord = (text) => {
  const m = String(text ?? '').trim().toLowerCase().match(/[a-z]+/);
  return m ? m[0] : null;
};
const numScore = (ans) => (raw) => {
  const n = firstNumber(raw);
  return { parsed: n === null ? null : String(n), correct: n !== null && String(n) === String(ans) };
};

const ordinal = (k) => ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'][k] || `${k}th`;

function evalPrecedence(nums, ops) {
  const v = [nums[0]];
  const o = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i] === '×') v[v.length - 1] = v[v.length - 1] * nums[i + 1];
    else {
      o.push(ops[i]);
      v.push(nums[i + 1]);
    }
  }
  let r = v[0];
  for (let i = 0; i < o.length; i++) r = o[i] === '+' ? r + v[i + 1] : r - v[i + 1];
  return r;
}

function modpow(base, exp, mod) {
  let b = BigInt(base) % BigInt(mod);
  let e = BigInt(exp);
  const m = BigInt(mod);
  let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return Number(r);
}

const PIN_WORDS = [
  'red', 'sky', 'cat', 'dog', 'one', 'two', 'sun', 'box', 'car', 'pen',
  'ice', 'map', 'run', 'top', 'fox', 'key', 'arm', 'bee', 'cup', 'dot',
];

export const FAMILIES = [
  {
    id: 'multiplication',
    title: 'Multi-digit multiplication',
    generate(level, rng) {
      const d1 = Math.min(2 + Math.floor(level / 2), 8);
      const d2 = Math.min(1 + Math.floor((level + 1) / 2), 7);
      const a = randDigits(rng, d1);
      const b = randDigits(rng, d2);
      const ans = a * b;
      return {
        prompt: `Compute ${a} × ${b}. Respond with only the resulting integer and nothing else.`,
        answer: String(ans),
        score: numScore(ans),
      };
    },
  },
  {
    id: 'precedence',
    title: 'Order of operations',
    generate(level, rng) {
      const terms = 2 + Math.min(level, 10); // 3..12
      const nums = [];
      const ops = [];
      for (let i = 0; i < terms; i++) nums.push(randint(rng, 2, 9));
      for (let i = 0; i < terms - 1; i++) ops.push(choice(rng, ['+', '-', '×']));
      const expr = nums[0] + ops.map((o, i) => ` ${o} ${nums[i + 1]}`).join('');
      const ans = evalPrecedence(nums, ops);
      return {
        prompt: `Compute ${expr}. Use standard order of operations. Respond with only the resulting integer and nothing else.`,
        answer: String(ans),
        score: numScore(ans),
      };
    },
  },
  {
    id: 'counting',
    title: 'Letter counting in a string',
    generate(level, rng) {
      const len = 6 + level * 8; // 14..134
      const ab = 'abcdefg'.split('');
      let s = '';
      for (let i = 0; i < len; i++) s += choice(rng, ab);
      const t = choice(rng, ab);
      const ans = s.split('').filter((c) => c === t).length;
      return {
        prompt: `In the string "${s}", how many times does the letter "${t}" appear? Respond with only the integer and nothing else.`,
        answer: String(ans),
        score: numScore(ans),
      };
    },
  },
  {
    id: 'modular',
    title: 'Modular exponentiation',
    generate(level, rng) {
      const base = randint(rng, 2, 9);
      const exp = 2 + level; // 3..18
      const mod = level < 8 ? 100 : 1000;
      const ans = modpow(base, exp, mod);
      return {
        prompt: `Compute ${base}^${exp} mod ${mod} (the remainder when ${base} to the power ${exp} is divided by ${mod}). Respond with only the integer and nothing else.`,
        answer: String(ans),
        score: numScore(ans),
      };
    },
  },
  {
    id: 'selection',
    title: 'Nth-largest selection',
    generate(level, rng) {
      const n = 3 + level * 2; // 5..35
      const vals = sampleDistinct(rng, 10, 99, n);
      const k = randint(rng, 2, Math.min(n - 1, 6));
      const ans = [...vals].sort((a, b) => b - a)[k - 1];
      return {
        prompt: `Consider this list: ${vals.join(', ')}. What is the ${ordinal(k)} largest number in it? Respond with only the number and nothing else.`,
        answer: String(ans),
        score: numScore(ans),
      };
    },
  },
  {
    id: 'instruction',
    title: 'Multi-constraint formatting',
    generate(level, rng) {
      const W = 2 + level; // 3..18 words
      const noRepeat = level >= 2;
      const nPins = Math.min(Math.max(0, level - 1), W - 1, PIN_WORDS.length);
      const positions = sampleDistinct(rng, 1, W, nPins);
      const used = new Set();
      const pins = [];
      for (const pos of positions) {
        let w;
        do {
          w = choice(rng, PIN_WORDS);
        } while (used.has(w));
        used.add(w);
        pins.push({ pos, word: w });
      }
      const reqs = [`exactly ${W} words`, `all words lowercase letters only`, `single spaces between words`];
      if (noRepeat) reqs.push(`no word repeated`);
      for (const p of pins) reqs.push(`word #${p.pos} must be "${p.word}"`);
      const prompt = `Respond with: ${reqs.join('; ')}. Output only the words, nothing else.`;
      const score = (raw) => {
        const t = String(raw ?? '').trim();
        const toks = t.split(/\s+/).filter(Boolean);
        let ok = toks.length === W && toks.every((w) => /^[a-z]+$/.test(w));
        if (noRepeat) ok = ok && new Set(toks).size === toks.length;
        for (const p of pins) ok = ok && toks[p.pos - 1] === p.word;
        return { parsed: t.slice(0, 60), correct: ok };
      };
      return {
        prompt,
        answer: `${W} words${pins.length ? '; ' + pins.map((p) => `#${p.pos}=${p.word}`).join(',') : ''}`,
        score,
      };
    },
  },
];

export const FAMILY_IDS = FAMILIES.map((f) => f.id);
