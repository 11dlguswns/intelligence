const base = import.meta.env.BASE_URL;

// Load a JSON file from public/data/. Cache-busted so auto-refresh always sees the
// freshly published measurement (GitHub Pages/CDN otherwise serves a stale copy).
export async function loadJson<T>(name: string): Promise<T | null> {
  try {
    const res = await fetch(`${base}data/${name}?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
