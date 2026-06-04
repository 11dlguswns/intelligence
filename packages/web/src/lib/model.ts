// Friendly labels + stable colors for model ids like "claude-haiku-4-5-20251001".

const PALETTE: Record<string, string> = {
  Opus: '#cc785c', // Claude coral
  Sonnet: '#5b76b0', // muted blue
  Haiku: '#3e8b6a', // green
};
const FALLBACK = ['#cc785c', '#5b76b0', '#3e8b6a', '#c8893a', '#8a63a8', '#4a9aa8'];

export function modelFamily(id: string): string {
  const m = id.match(/(opus|sonnet|haiku)/i);
  return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : id;
}

export function modelLabel(id: string): string {
  const m = id.match(/(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/i);
  if (!m) return id;
  const name = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const ver = m[3] ? `${m[2]}.${m[3]}` : m[2];
  return `${name} ${ver}`;
}

export function modelColor(id: string, index = 0): string {
  return PALETTE[modelFamily(id)] ?? FALLBACK[index % FALLBACK.length];
}
