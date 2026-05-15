/**
 * Date/time helpers for the "last updated" indicator.
 * Pure, dependency-free (built-in Intl only) — mirrors lib/time-utils.ts.
 */

/** Latest of the given ISO timestamps, ignoring null/undefined/invalid. Null if none. */
export function maxIso(isos: (string | null | undefined)[]): string | null {
  let max: string | null = null;
  let maxT = -Infinity;
  for (const iso of isos) {
    if (!iso) continue;
    const t = new Date(iso).getTime();
    if (isNaN(t)) continue;
    if (t > maxT) {
      maxT = t;
      max = iso;
    }
  }
  return max;
}

/** "just now" / "2 days ago" / "3 months ago" in the viewer's locale. */
export function formatRelativeTime(iso: string): string {
  const ts = new Date(iso).getTime();
  if (isNaN(ts)) return "";
  const diffSec = Math.round((ts - Date.now()) / 1000);
  if (Math.abs(diffSec) < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const mins = Math.round(diffSec / 60);
  if (Math.abs(mins) < 60) return rtf.format(mins, "minute");
  const hours = Math.round(diffSec / 3600);
  if (Math.abs(hours) < 24) return rtf.format(hours, "hour");
  const days = Math.round(diffSec / 86400);
  if (Math.abs(days) < 7) return rtf.format(days, "day");
  const weeks = Math.round(diffSec / (86400 * 7));
  if (Math.abs(weeks) < 5) return rtf.format(weeks, "week");
  const months = Math.round(diffSec / (86400 * 30));
  if (Math.abs(months) < 12) return rtf.format(months, "month");
  const years = Math.round(diffSec / (86400 * 365));
  return rtf.format(years, "year");
}

/** Localized absolute date/time, e.g. "May 15, 2026, 3:42 PM". */
export function formatExactDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
