export interface DayCount {
  date: string;
  count: number;
}

const DAY_MS = 86_400_000;

/** UTC calendar day (YYYY-MM-DD) for a timestamp or Date. */
export function utcDay(input: string | Date): string {
  return new Date(input).toISOString().slice(0, 10);
}

/**
 * Daily counts for the `days` UTC days ending at `now` (inclusive).
 * Days with no timestamps are present with count 0.
 */
export function buildDailySeries(
  timestamps: string[],
  days: number,
  now: Date
): DayCount[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const day = utcDay(t);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  const series: DayCount[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(new Date(now.getTime() - i * DAY_MS));
    series.push({ date: day, count: counts.get(day) ?? 0 });
  }
  return series;
}

/** Number of timestamps within the last `days` days of `now`. */
export function countSince(
  timestamps: string[],
  days: number,
  now: Date
): number {
  const cutoff = now.getTime() - days * DAY_MS;
  return timestamps.filter((t) => new Date(t).getTime() >= cutoff).length;
}

/** Top-n most frequent truthy keys, count desc, ties alphabetical. */
export function topN(
  keys: (string | null | undefined)[],
  n: number
): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const k of keys) {
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, n);
}

const BOT_PATTERNS = [
  "bot",
  "crawler",
  "spider",
  "slurp",
  "headless",
  "lighthouse",
  "facebookexternalhit",
  "preview",
];

/** True when the user agent is missing or looks like a crawler. */
export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return true;
  const lower = ua.toLowerCase();
  return BOT_PATTERNS.some((p) => lower.includes(p));
}
