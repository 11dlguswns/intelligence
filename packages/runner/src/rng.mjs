// Small deterministic PRNG (mulberry32) + helpers. A run stores its seed string so
// every generated problem is reproducible and auditable later.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashStr(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const makeRng = (seedStr) => mulberry32(hashStr(seedStr));

export const randint = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1)); // inclusive
export const choice = (rng, arr) => arr[Math.floor(rng() * arr.length)];

export function sampleDistinct(rng, lo, hi, n) {
  const set = new Set();
  const span = hi - lo + 1;
  while (set.size < n && set.size < span) set.add(randint(rng, lo, hi));
  return [...set];
}

export function randDigits(rng, d) {
  if (d <= 1) return randint(rng, 2, 9);
  const lo = Math.pow(10, d - 1);
  const hi = Math.pow(10, d) - 1;
  return randint(rng, lo, hi);
}
