// Anthropic's historical "peak hours" window: weekdays 5–11 AM Pacific. During it
// (Mar–May 2026) usage counted faster against the budget; the reduction was removed
// for Pro/Max on 2026-05-06, but the window is still worth correlating latency with.

function ptInfo(date: Date): { dow: number; hour: number; minute: string; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  let hour = parseInt(get('hour'), 10);
  if (Number.isNaN(hour) || hour === 24) hour = 0;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return { dow: days.indexOf(weekday), hour, minute: get('minute'), weekday };
}

export function isPeak(iso: string): boolean {
  const { dow, hour } = ptInfo(new Date(iso));
  return dow >= 1 && dow <= 5 && hour >= 5 && hour < 11;
}

export function currentPeak(): { peak: boolean; clock: string } {
  const now = new Date();
  const { hour, minute, weekday } = ptInfo(now);
  return { peak: isPeak(now.toISOString()), clock: `${weekday} ${String(hour).padStart(2, '0')}:${minute} PT` };
}
