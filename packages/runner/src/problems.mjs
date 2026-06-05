// Dynamically GENERATED, DIFFICULTY-LADDERED problem bank.
//
// Frontier models ceiling on any single fixed difficulty (Opus/Sonnet/Haiku all ~100),
// so a fixed test can't discriminate them. Instead we measure WHERE EACH MODEL BREAKS:
// every dimension is probed at several difficulty levels (easy → hard), and the score is
// a level-weighted pass rate. Everything breaks eventually — just at different difficulty —
// so this separates models AND makes degradation more sensitive (a weakened model breaks
// one level earlier). Still contamination-proof (fresh random instance per level per run)
// and exact-graded in code (no LLM judge).
//
// Each family exposes gen(rng, level) -> {id,type,answer,prompt,meta}. Difficulty grows
// monotonically with `level`.

// ----- deterministic RNG (seeded per run/dim/level so instances are reproducible) -----
export function hashSeed(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ----- small math helpers -----
const fact = (n) => {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
};
const comb = (n, k) => (k < 0 || k > n ? 0 : fact(n) / (fact(k) * fact(n - k)));
const gcd = (a, b) => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
};
const reduceFrac = (n, d) => {
  const g = gcd(n, d);
  let nn = n / g,
    dd = d / g;
  if (dd < 0) {
    nn = -nn;
    dd = -dd;
  }
  return { n: nn, d: dd };
};

const FINAL = (fmt) => `\n\n반드시 마지막 줄에 다른 말 없이 정확히 이 형식으로만 최종 답을 적어라 → 정답: ${fmt}`;

// =====================================================================================
// LADDERED FAMILIES — one per dimension. gen(rng, level), higher level = harder.
// =====================================================================================

// 추론 — 기사와 건달. Difficulty = number of people (deduction depth).
function genKnaves(rng, level) {
  const people = 3 + Math.ceil(level / 2); // L2→4, L4→5, L6→6
  const pool = ['민준', '서연', '도윤', '하은', '지호', '예준', '수아'];
  for (let attempt = 0; attempt < 600; attempt++) {
    const names = shuffle(rng, pool).slice(0, people);
    const type = {};
    names.forEach((n) => (type[n] = rng() < 0.5));
    const chosen = {};
    let ok = true;
    for (const sp of names) {
      const others = names.filter((n) => n !== sp);
      const cands = [];
      for (const t of others) {
        cands.push({ render: `${t}는 건달이다`, pred: (a) => !a[t] });
        cands.push({ render: `${t}는 기사이다`, pred: (a) => a[t] });
        cands.push({ render: `${t}와 나는 같은 부류이다`, pred: (a) => a[t] === a[sp] });
      }
      for (let i = 0; i < others.length; i++)
        for (let j = i + 1; j < others.length; j++) {
          const t = others[i],
            u = others[j];
          cands.push({ render: `${t}와 ${u} 중 적어도 한 명은 건달이다`, pred: (a) => !a[t] || !a[u] });
        }
      const want = type[sp];
      const good = shuffle(rng, cands).find((c) => c.pred(type) === want);
      if (!good) {
        ok = false;
        break;
      }
      chosen[sp] = good;
    }
    if (!ok) continue;
    const M = names.length;
    let sols = 0;
    for (let mask = 0; mask < 1 << M; mask++) {
      const a = {};
      names.forEach((n, i) => (a[n] = !!(mask & (1 << i))));
      if (names.every((sp) => chosen[sp].pred(a) === a[sp])) sols++;
    }
    if (sols !== 1) continue;
    const knaves = names.filter((n) => !type[n]).sort();
    const lines = names.map((n) => `${n}: "${chosen[n].render}"`).join('\n');
    const prompt =
      `어떤 섬에는 기사(항상 참말만 함)와 건달(항상 거짓말만 함)만 산다. 다음 진술들을 보고 각 사람이 기사인지 건달인지 추론하라.\n\n${lines}\n\n이 중 '건달'인 사람을 모두 골라라.` +
      FINAL('이름, 이름 (건달이 없으면 "없음")');
    return { id: 'reasoning', type: 'set', answer: knaves, meta: { people: names }, prompt };
  }
  return null;
}

// 수학 — 다단계 연산 사슬. Difficulty = number of steps (sequential-computation length).
function genChain(rng, level) {
  const steps = 2 * level; // L2→4, L4→8, L6→12
  let v = rint(rng, 6, 20);
  const lines = [`${v}에서 시작한다.`];
  for (let i = 0; i < steps; i++) {
    const kind = rint(rng, 0, 3);
    let desc;
    if (kind === 0) {
      const a = rint(rng, 2, 9);
      v += a;
      desc = `${a}를 더한다`;
    } else if (kind === 1) {
      const a = rint(rng, 2, 9);
      if (v - a > 0) {
        v -= a;
        desc = `${a}를 뺀다`;
      } else {
        v += a;
        desc = `${a}를 더한다`;
      }
    } else if (kind === 2) {
      const b = rint(rng, 2, 4);
      v *= b;
      desc = `${b}을 곱한다`;
    } else {
      const ds = [2, 3, 4, 5].filter((d) => v % d === 0 && v / d > 0);
      if (ds.length) {
        const d = choice(rng, ds);
        v /= d;
        desc = `${d}로 나눈다`;
      } else {
        const a = rint(rng, 2, 9);
        v += a;
        desc = `${a}를 더한다`;
      }
    }
    lines.push(`${i + 1}) ${desc}`);
  }
  const prompt =
    `어떤 수에 다음 연산을 순서대로 적용한다.\n${lines.join('\n')}\n\n모든 연산을 마친 뒤의 최종 값을 구하라.` +
    FINAL('<정수>');
  return { id: 'math', type: 'int', answer: v, prompt };
}

// 확률 — 비복원 추출 "정확히 j개". Difficulty = pool/draw size (bigger exact fraction).
function genUrn(rng, level) {
  const r = level + 2,
    b = level + 2; // L2→4, L4→6, L6→8 each
  const k = Math.min(2 + Math.floor(level / 2), r + b - 1, 6); // L2→3, L4→4, L6→5
  const j = rint(rng, 1, Math.min(k, r));
  const f = reduceFrac(comb(r, j) * comb(b, k - j), comb(r + b, k));
  const prompt =
    `주머니에 빨간 공 ${r}개와 파란 공 ${b}개가 들어 있다. 여기서 동시에 ${k}개를 무작위로 꺼낼 때, 꺼낸 공 중 빨간 공이 정확히 ${j}개일 확률을 기약분수로 구하라.` +
    FINAL('<분자>/<분모>');
  return { id: 'probability', type: 'frac', answer: f, prompt };
}

// 공간 — 격자 경로 수(장애물 포함). Difficulty = grid size + blocks (bigger DP).
function genGrid(rng, level) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const W = level + 2,
      H = level + 2; // L2→4×4 … L6→8×8
    const blocks = new Set();
    const nb = level;
    for (let t = 0; t < nb; t++) {
      const bx = rint(rng, 0, W - 1),
        by = rint(rng, 0, H - 1);
      if ((bx === 0 && by === 0) || (bx === W - 1 && by === H - 1)) continue;
      blocks.add(bx + ',' + by);
    }
    const dp = Array.from({ length: W }, () => Array(H).fill(0));
    for (let x = 0; x < W; x++)
      for (let y = 0; y < H; y++) {
        if (blocks.has(x + ',' + y)) {
          dp[x][y] = 0;
          continue;
        }
        if (x === 0 && y === 0) {
          dp[x][y] = 1;
          continue;
        }
        dp[x][y] = (x > 0 ? dp[x - 1][y] : 0) + (y > 0 ? dp[x][y - 1] : 0);
      }
    const ans = dp[W - 1][H - 1];
    if (ans < 2) continue;
    const bl = [...blocks].map((s) => '(' + s + ')').join(', ') || '없음';
    const prompt =
      `${W}열 × ${H}행 격자가 있다. 왼쪽 맨 아래 칸 (0,0)에서 출발해 매번 오른쪽 또는 위로 한 칸씩만 이동하여 오른쪽 맨 위 칸 (${W - 1},${H - 1})까지 간다. 좌표는 (열,행)이며 다음 칸은 막혀 있어 지날 수 없다: ${bl}. 갈 수 있는 서로 다른 경로의 수를 구하라.` +
      FINAL('<정수>');
    return { id: 'spatial', type: 'int', answer: ans, prompt };
  }
  return null;
}

// 조합 — 동전 교환 가짓수. Difficulty = amount + coin types (more ways to enumerate).
function genCoins(rng, level) {
  const nTypes = level <= 2 ? 3 : 4;
  const others = shuffle(rng, [2, 5, 10, 25, 50]).slice(0, nTypes - 1);
  const coins = [1, ...others].sort((x, y) => x - y);
  const amount = 10 + level * 9; // L2→28, L4→46, L6→64
  const dp = Array(amount + 1).fill(0);
  dp[0] = 1;
  for (const c of coins) for (let v = c; v <= amount; v++) dp[v] += dp[v - c];
  const prompt =
    `${coins.join('원, ')}원짜리 동전을 각각 원하는 개수만큼 사용해 정확히 ${amount}원을 만들려고 한다. 동전을 내는 순서는 구분하지 않을 때, 서로 다른 방법은 모두 몇 가지인가?` +
    FINAL('<정수>');
  return { id: 'combinatorics', type: 'int', answer: dp[amount], prompt };
}

// 절차 — 반복 모듈러 곱. Difficulty = iteration count + modulus (long careful chain).
function genModExp(rng, level) {
  const a = rint(rng, 2, 9);
  const m = 7 + level * 4; // L2→15, L4→23, L6→31
  const T = level * 2 + 4; // L2→8, L4→12, L6→16
  let v = 1;
  for (let t = 0; t < T; t++) v = (v * a) % m;
  const prompt =
    `1에서 시작한다. 다음 과정을 정확히 ${T}번 반복한다: 현재 값에 ${a}를 곱한 뒤, 그 결과를 ${m}으로 나눈 나머지로 바꾼다. ${T}번 반복한 뒤의 최종 값을 구하라.` +
    FINAL('<정수>');
  return { id: 'process', type: 'int', answer: v, prompt };
}

// ----- ladder registry: one family per dimension -----
const FAMILIES = [
  { dim: 'reasoning', title: '기사와 건달', gen: genKnaves },
  { dim: 'math', title: '연산 사슬', gen: genChain },
  { dim: 'probability', title: '공 뽑기 확률', gen: genUrn },
  { dim: 'spatial', title: '격자 경로', gen: genGrid },
  { dim: 'combinatorics', title: '동전 교환', gen: genCoins },
  { dim: 'process', title: '반복 모듈러', gen: genModExp },
];

export const DIMENSIONS = FAMILIES.map((f) => f.dim);
export const DIM_TITLE = Object.fromEntries(FAMILIES.map((f) => [f.dim, f.title]));
export const LADDER_LEVELS = [2, 4, 6]; // easy / medium / hard
export const LEVEL_WEIGHT = { 2: 2, 4: 4, 6: 6 }; // harder levels count for more

// Build the full ladder for a run: each dimension × each level gets a fresh instance,
// seeded by (run, dim, level) so every model faces the IDENTICAL set.
export function generateLadder(seedStr) {
  return FAMILIES.map((fam) => {
    const levels = LADDER_LEVELS.map((L) => {
      const rng = makeRng(hashSeed(`${seedStr}|${fam.dim}|${L}`));
      let inst = null;
      for (let t = 0; t < 25 && !inst; t++) inst = fam.gen(rng, L);
      if (!inst) throw new Error(`failed to generate ${fam.dim} level ${L}`);
      return { ...inst, level: L };
    });
    return { dim: fam.dim, title: fam.title, levels };
  });
}

// Human-readable canonical answer (logged for the details view).
export function formatAnswer(inst) {
  switch (inst.type) {
    case 'int':
      return String(inst.answer);
    case 'frac':
      return inst.answer.d === 1 ? String(inst.answer.n) : `${inst.answer.n}/${inst.answer.d}`;
    case 'set':
      return inst.answer.length ? inst.answer.join(', ') : '없음';
    case 'seq':
      return inst.answer.join(' → ');
    default:
      return String(inst.answer);
  }
}

// ----- grading (exact, partial credit for set answers) -----
function lastAnswerLine(text) {
  const ms = [...String(text).matchAll(/정답\s*[:：]?\s*([^\n]*)/g)];
  if (ms.length) return ms[ms.length - 1][1];
  const lines = String(text).split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}
const allInts = (s) => (String(s).match(/-?\d+/g) || []).map(Number);

function gradeInt(tail, full, ans) {
  let nums = allInts(tail);
  if (!nums.length) nums = allInts(full);
  if (!nums.length) return 0;
  return nums[nums.length - 1] === ans ? 100 : 0;
}
function gradeFrac(tail, ans) {
  const fm = tail.match(/(-?\d+)\s*\/\s*(\d+)/);
  if (fm) return Number(fm[1]) * ans.d === ans.n * Number(fm[2]) ? 100 : 0;
  const dm = tail.match(/-?\d+(?:\.\d+)?/);
  if (dm) return Math.abs(parseFloat(dm[0]) - ans.n / ans.d) < 1e-2 ? 100 : 0;
  return 0;
}
function gradeSet(tail, knaves, people) {
  let correct = 0;
  for (const p of people) {
    const predictedKnave = tail.includes(p);
    if (predictedKnave === knaves.includes(p)) correct++;
  }
  return Math.round((100 * correct) / people.length);
}

export function gradeInstance(inst, text) {
  const tail = lastAnswerLine(text);
  const full = String(text || '');
  switch (inst.type) {
    case 'int':
      return gradeInt(tail, full, inst.answer);
    case 'frac':
      return gradeFrac(tail, inst.answer);
    case 'set':
      return gradeSet(tail, inst.answer, inst.meta.people);
    default:
      return 0;
  }
}
