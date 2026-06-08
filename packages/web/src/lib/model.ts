// Friendly labels + stable colors for model ids like "claude-haiku-4-5-20251001".

// Brightened for the dark theme so dots/bars/lines pop against near-black surfaces.
const PALETTE: Record<string, string> = {
  Opus: '#ef9a78', // Claude coral
  Sonnet: '#8aa0e8', // periwinkle blue
  Haiku: '#52c896', // emerald
};
const FALLBACK = ['#ef9a78', '#8aa0e8', '#52c896', '#e3ad48', '#b98ad6', '#54bcc9'];

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
