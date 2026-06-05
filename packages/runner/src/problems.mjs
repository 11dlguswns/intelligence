// Dynamically GENERATED problem bank. The whole point: every run we synthesize FRESH
// instances (random parameters) and compute the ground-truth answer in code, then grade
// the model's reply by exact comparison — no LLM judge.
//
// Why this beats a fixed question list:
//   * Contamination-proof. Classic puzzles (12-ball, Monty Hall, …) are memorized; a
//     model can recite the canonical answer without reasoning, and a *degraded* model
//     can too — hiding the degradation. A novel instance forces actual reasoning, so a
//     weakened model visibly fails. (Same effect GSM-Symbolic showed: perturb the
//     numbers and "solved" benchmarks drop.)
//   * Low noise. The answer is computed, not judged, so run-to-run change = real change.
//   * Half the cost. One answer call per problem, zero judge calls.
//
// Each family exposes gen(rng) -> instance {id,dimension,title,prompt,type,answer,meta}.
// Grading is exact (with partial credit where the answer has parts).

// ----- deterministic RNG (seeded per run so instances are reproducible + logged) -----
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
function permutations(arr) {
  if (arr.length <= 1) return [arr];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

const FINAL = (fmt) => `\n\n반드시 마지막 줄에 다른 말 없이 정확히 이 형식으로만 최종 답을 적어라 → 정답: ${fmt}`;

// =====================================================================================
// FAMILIES
// =====================================================================================

// 추론 1 — 기사와 건달 (knights always true / knaves always false). Statements are built
// to be consistent with a hidden assignment, then we verify that assignment is UNIQUE.
function genKnaves(rng) {
  const pool = ['민준', '서연', '도윤', '하은', '지호'];
  for (let attempt = 0; attempt < 300; attempt++) {
    const names = shuffle(rng, pool).slice(0, rint(rng, 4, 5));
    const type = {}; // true = knight
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
    // uniqueness over all 2^N assignments
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
    return { id: 'knaves', type: 'set', answer: knaves, meta: { people: names }, prompt };
  }
  return null;
}

// 추론 2 — 순서 배치 (unique linear order from constraints we know hold for a hidden order)
function genOrder(rng) {
  const pool = ['가', '나', '다', '라', '마'];
  for (let attempt = 0; attempt < 80; attempt++) {
    const people = shuffle(rng, pool).slice(0, 5);
    const N = people.length;
    const order = shuffle(rng, people);
    const pos = Object.fromEntries(order.map((p, i) => [p, i]));
    const cands = [];
    for (const x of people)
      for (const y of people)
        if (x !== y) {
          if (pos[x] < pos[y]) cands.push({ render: `${x}는 ${y}보다 앞에 있다`, pred: (p) => p[x] < p[y] });
          if (pos[x] + 1 === pos[y]) cands.push({ render: `${x}는 ${y}의 바로 앞에 있다`, pred: (p) => p[x] + 1 === p[y] });
        }
    for (const x of people) {
      if (pos[x] === 0) cands.push({ render: `${x}는 맨 앞에 있다`, pred: (p) => p[x] === 0 });
      if (pos[x] === N - 1) cands.push({ render: `${x}는 맨 뒤에 있다`, pred: (p) => p[x] === N - 1 });
    }
    for (const x of people)
      for (const y of people)
        if (x !== y) {
          const k = Math.abs(pos[x] - pos[y]) - 1;
          if (k >= 1) cands.push({ render: `${x}와 ${y} 사이에 정확히 ${k}명이 서 있다`, pred: (p) => Math.abs(p[x] - p[y]) - 1 === k });
        }
    const perms = permutations(people);
    const sat = (cs) => perms.filter((pm) => {
      const p = Object.fromEntries(pm.map((q, i) => [q, i]));
      return cs.every((c) => c.pred(p));
    }).length;
    const chosen = [];
    for (const c of shuffle(rng, cands)) {
      if (sat([...chosen, c]) >= 1) {
        chosen.push(c);
        if (sat(chosen) === 1) break;
      }
    }
    if (chosen.length >= 2 && sat(chosen) === 1) {
      const lines = chosen.map((c, i) => `${i + 1}. ${c.render}`).join('\n');
      const prompt =
        `${people.join(', ')} ${N}명이 한 줄로 서 있다. 다음 단서를 모두 만족하는 줄의 순서를 앞에서부터 구하라.\n\n${lines}` +
        FINAL('이름, 이름, ... (앞에서부터 순서대로)');
      return { id: 'ordering', type: 'seq', answer: order, meta: { n: N }, prompt };
    }
  }
  return null;
}

// 수학 1 — 다단계 공장 문장제 (integer answer)
function genFactory(rng) {
  const machines = rint(rng, 3, 9);
  const perBatch = rint(rng, 2, 9);
  const batchMin = choice(rng, [2, 3, 4, 5, 6]);
  const hours = choice(rng, [2, 3, 4, 5, 6]);
  const minutes = hours * 60;
  const perMachine = Math.floor(minutes / batchMin) * perBatch;
  const total = perMachine * machines;
  const defectPct = choice(rng, [0, 5, 10, 20, 25]);
  const good = Math.floor((total * (100 - defectPct)) / 100);
  const box = choice(rng, [6, 8, 10, 12]);
  const boxes = Math.floor(good / box);
  const prompt =
    `한 공장에 똑같은 기계가 ${machines}대 있다. 각 기계는 ${batchMin}분마다 부품 ${perBatch}개를 만든다. ${hours}시간 동안 가동한 뒤 전체 생산량의 ${defectPct}%가 불량으로 폐기된다. 남은 양품을 ${box}개들이 상자에 담을 때, 가득 채운 상자는 몇 개인가?` +
    FINAL('<정수>');
  return { id: 'factory', type: 'int', answer: boxes, prompt };
}

// 수학 2 — 연립 추론 (two unknowns, unique integer solution; ask the product)
function genLinsys(rng) {
  for (let i = 0; i < 50; i++) {
    const x = rint(rng, 4, 16),
      y = rint(rng, 3, 16);
    const a = rint(rng, 2, 4);
    const d = a * x - y;
    if (d <= 0) continue;
    const s = x + y;
    const prompt =
      `두 자연수 x와 y가 있다. 둘의 합은 ${s}이고, x의 ${a}배는 y보다 ${d}만큼 크다. x × y 의 값을 구하라.` +
      FINAL('<정수>');
    return { id: 'linsys', type: 'int', answer: x * y, prompt };
  }
  return null;
}

// 확률 1 — 비복원 추출, "정확히 j개" (exact reduced fraction; harder than all-red)
function genUrn(rng) {
  const r = rint(rng, 3, 6),
    b = rint(rng, 3, 6);
  const k = rint(rng, 2, 4);
  const j = rint(rng, 1, Math.min(k, r));
  // P(exactly j red) = C(r,j)·C(b,k-j) / C(r+b,k)
  const f = reduceFrac(comb(r, j) * comb(b, k - j), comb(r + b, k));
  const prompt =
    `주머니에 빨간 공 ${r}개와 파란 공 ${b}개가 들어 있다. 여기서 동시에 ${k}개를 무작위로 꺼낼 때, 꺼낸 공 중 빨간 공이 정확히 ${j}개일 확률을 기약분수로 구하라.` +
    FINAL('<분자>/<분모>');
  return { id: 'urn', type: 'frac', answer: f, prompt };
}

// 확률 2 — 제곱 상금의 기댓값 (E[f²]; harder than a linear payoff)
function genEV(rng) {
  const F = choice(rng, [6, 8]);
  // E[f²] over a fair F-sided die = (F+1)(2F+1)/6
  const f = reduceFrac((F + 1) * (2 * F + 1), 6);
  const prompt =
    `공정한 ${F}면체 주사위를 한 번 굴려 나온 눈을 f라 하자. 상금은 f를 제곱한 f²원이다. 받게 될 상금의 기댓값을 기약분수 또는 정수로 구하라.` +
    FINAL('<값> (분수면 분자/분모)');
  return { id: 'ev', type: 'frac', answer: f, prompt };
}

// 공간 1 — 색칠한 정육면체 절단 (random size, random painted faces, random target k)
function genCube(rng) {
  const N = rint(rng, 3, 6);
  const faces = ['+x', '-x', '+y', '-y', '+z', '-z'];
  let painted;
  do {
    painted = faces.filter(() => rng() < 0.6);
  } while (painted.length === 0);
  const k = rint(rng, 1, 3);
  let count = 0;
  for (let i = 0; i < N; i++)
    for (let j = 0; j < N; j++)
      for (let l = 0; l < N; l++) {
        let f = 0;
        if (painted.includes('+x') && i === N - 1) f++;
        if (painted.includes('-x') && i === 0) f++;
        if (painted.includes('+y') && j === N - 1) f++;
        if (painted.includes('-y') && j === 0) f++;
        if (painted.includes('+z') && l === N - 1) f++;
        if (painted.includes('-z') && l === 0) f++;
        if (f === k) count++;
      }
  const ko = { '+x': '오른쪽', '-x': '왼쪽', '+y': '뒤', '-y': '앞', '+z': '위', '-z': '아래' };
  const list = painted.map((x) => ko[x]).join(', ');
  const prompt =
    `한 변의 길이가 ${N}인 정육면체가 있다. 이 정육면체의 겉면 중 [${list}] 면에만 페인트를 칠한 다음, 1×1×1 단위 정육면체 ${N ** 3}개로 모두 잘랐다. 페인트가 정확히 ${k}개의 면에 칠해진 단위 정육면체는 몇 개인가?` +
    FINAL('<정수>');
  return { id: 'cube', type: 'int', answer: count, prompt };
}

// 공간 2 — 격자 경로 수 (right/up only, some blocked cells; DP count)
function genGrid(rng) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const W = rint(rng, 3, 6),
      H = rint(rng, 3, 6);
    const blocks = new Set();
    const nb = rint(rng, 1, 4);
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
    const bl = [...blocks].map((b) => '(' + b + ')').join(', ') || '없음';
    const prompt =
      `${W}열 × ${H}행 격자가 있다. 왼쪽 맨 아래 칸 (0,0)에서 출발해 매번 오른쪽 또는 위로 한 칸씩만 이동하여 오른쪽 맨 위 칸 (${W - 1},${H - 1})까지 간다. 좌표는 (열,행)이며 다음 칸은 막혀 있어 지날 수 없다: ${bl}. 갈 수 있는 서로 다른 경로의 수를 구하라.` +
      FINAL('<정수>');
    return { id: 'gridpath', type: 'int', answer: ans, prompt };
  }
  return null;
}

// 조합 1 — 포함배제 계수 세기 (two "or" divisors, two "not" divisors — deeper)
function genCountDiv(rng) {
  const N = choice(rng, [120, 150, 180, 200, 250]);
  const a = choice(rng, [2, 3, 4]);
  const b = choice(rng, [5, 6, 7]);
  const c = choice(rng, [3, 4, 9]);
  const d = choice(rng, [7, 8, 11]);
  let cnt = 0;
  for (let k = 1; k <= N; k++) if ((k % a === 0 || k % b === 0) && k % c !== 0 && k % d !== 0) cnt++;
  const prompt =
    `1부터 ${N}까지의 정수 중에서, ${a} 또는 ${b}로 나누어떨어지면서, ${c}로도 ${d}로도 나누어떨어지지 않는 수는 모두 몇 개인가?` +
    FINAL('<정수>');
  return { id: 'countdiv', type: 'int', answer: cnt, prompt };
}

// 조합 2 — 동전 교환 가짓수 (unordered; DP count; 3-4 coin types, larger amount)
function genCoins(rng) {
  const others = shuffle(rng, [2, 5, 10, 25]).slice(0, rint(rng, 2, 3));
  const coins = [1, ...others].sort((x, y) => x - y);
  const amount = rint(rng, 18, 45);
  const dp = Array(amount + 1).fill(0);
  dp[0] = 1;
  for (const c of coins) for (let v = c; v <= amount; v++) dp[v] += dp[v - c];
  const prompt =
    `${coins.join('원, ')}원짜리 동전을 각각 원하는 개수만큼 사용해 정확히 ${amount}원을 만들려고 한다. 동전을 내는 순서는 구분하지 않을 때, 서로 다른 방법은 모두 몇 가지인가?` +
    FINAL('<정수>');
  return { id: 'coins', type: 'int', answer: dp[amount], prompt };
}

// 절차 1 — 콜라츠형 반복 (careful step counting)
function genCollatz(rng) {
  const start = rint(rng, 12, 80);
  let n = start,
    steps = 0;
  while (n !== 1 && steps < 1000) {
    n = n % 2 === 0 ? n / 2 : 3 * n + 1;
    steps++;
  }
  const prompt =
    `수 ${start}에서 시작한다. 다음 규칙을 1이 될 때까지 반복한다: 현재 수가 짝수이면 2로 나누고, 홀수이면 3을 곱한 뒤 1을 더한다. 1에 도달할 때까지 수행한 연산(단계)의 총 횟수를 구하라.` +
    FINAL('<정수>');
  return { id: 'collatz', type: 'int', answer: steps, prompt };
}

// 절차 2 — 반복 모듈러 (careful modular arithmetic)
function genModExp(rng) {
  const a = rint(rng, 2, 9);
  const m = rint(rng, 7, 30);
  const T = rint(rng, 5, 13);
  let v = 1;
  for (let t = 0; t < T; t++) v = (v * a) % m;
  const prompt =
    `1에서 시작한다. 다음 과정을 정확히 ${T}번 반복한다: 현재 값에 ${a}를 곱한 뒤, 그 결과를 ${m}으로 나눈 나머지로 바꾼다. ${T}번 반복한 뒤의 최종 값을 구하라.` +
    FINAL('<정수>');
  return { id: 'modexp', type: 'int', answer: v, prompt };
}

// ----- registry -----
export const PROBLEMS = [
  { id: 'knaves', dimension: 'reasoning', title: '기사와 건달', gen: genKnaves },
  { id: 'ordering', dimension: 'reasoning', title: '줄 세우기', gen: genOrder },
  { id: 'factory', dimension: 'math', title: '공장 생산', gen: genFactory },
  { id: 'linsys', dimension: 'math', title: '두 수 추론', gen: genLinsys },
  { id: 'urn', dimension: 'probability', title: '공 뽑기', gen: genUrn },
  { id: 'ev', dimension: 'probability', title: '상금 기댓값', gen: genEV },
  { id: 'cube', dimension: 'spatial', title: '색칠 정육면체', gen: genCube },
  { id: 'gridpath', dimension: 'spatial', title: '격자 경로', gen: genGrid },
  { id: 'countdiv', dimension: 'combinatorics', title: '배수 세기', gen: genCountDiv },
  { id: 'coins', dimension: 'combinatorics', title: '동전 교환', gen: genCoins },
  { id: 'collatz', dimension: 'process', title: '반복 규칙', gen: genCollatz },
  { id: 'modexp', dimension: 'process', title: '반복 나머지', gen: genModExp },
];

export const PROBLEM_IDS = PROBLEMS.map((p) => p.id);
export const DIMENSIONS = ['reasoning', 'math', 'probability', 'spatial', 'combinatorics', 'process'];

const META = Object.fromEntries(PROBLEMS.map((p) => [p.id, p]));

// Generate one fresh instance per family, deterministically from a seed string.
export function generateInstances(seedStr) {
  const rng = makeRng(hashSeed(seedStr));
  const out = [];
  for (const p of PROBLEMS) {
    let inst = null;
    for (let tries = 0; tries < 12 && !inst; tries++) inst = p.gen(rng);
    if (!inst) throw new Error(`failed to generate instance for ${p.id}`);
    out.push({ ...inst, dimension: p.dimension, title: p.title });
  }
  return out;
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

// ----- grading (exact, with partial credit for multi-part answers) -----
function lastAnswerLine(text) {
  const ms = [...String(text).matchAll(/정답\s*[:：]?\s*([^\n]*)/g)];
  if (ms.length) return ms[ms.length - 1][1];
  // fallback: last non-empty line
  const lines = String(text).split('\n').map((s) => s.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}
const allInts = (s) => (String(s).match(/-?\d+/g) || []).map(Number);

function gradeInt(tail, full, ans) {
  let nums = allInts(tail);
  if (!nums.length) nums = allInts(full);
  if (!nums.length) return 0;
  // prefer the last integer on the answer line (after a label like "정답:")
  const g = nums[nums.length - 1];
  return g === ans ? 100 : 0;
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
    const actualKnave = knaves.includes(p);
    if (predictedKnave === actualKnave) correct++;
  }
  return Math.round((100 * correct) / people.length);
}
function gradeSeq(tail, order) {
  const toks = tail.split(/[^가-힣A-Za-z]+/).filter((t) => order.includes(t));
  // dedupe preserving first occurrence
  const seen = new Set();
  const guess = [];
  for (const t of toks) if (!seen.has(t)) (seen.add(t), guess.push(t));
  const N = order.length;
  let pairs = 0,
    correct = 0;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) {
      pairs++;
      const gi = guess.indexOf(order[i]),
        gj = guess.indexOf(order[j]);
      if (gi !== -1 && gj !== -1 && gi < gj) correct++;
    }
  return Math.round((100 * correct) / pairs);
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
      return gradeSet(tail, inst.answer, inst.meta.people); // ONLY the final 정답: line, not the reasoning
    case 'seq':
      return gradeSeq(tail, inst.answer);
    default:
      return 0;
  }
}
