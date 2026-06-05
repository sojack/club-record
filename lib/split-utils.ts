import type { SplitTime } from "@/types/database";
import { parseTimeToMs } from "@/lib/time-utils";

/**
 * Parse the CSV `Splits` cell — cumulative `distance=time` pairs separated by
 * `;`, e.g. "50=29.10;100=1:02.78". Returns null for empty/missing input.
 * Throws a descriptive Error on a malformed pair so the importer can surface it.
 */
export function parseSplitsColumn(raw: string | undefined): SplitTime[] | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  const out: SplitTime[] = [];
  for (const pairRaw of s.split(";")) {
    const pair = pairRaw.trim();
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq === -1) {
      throw new Error(`Malformed split "${pair}" (expected distance=time)`);
    }
    const distStr = pair.slice(0, eq).trim();
    const timeStr = pair.slice(eq + 1).trim();
    const distance = Number(distStr);
    if (!Number.isInteger(distance) || distance <= 0) {
      throw new Error(`Invalid split distance "${distStr}"`);
    }
    const ms = parseTimeToMs(timeStr);
    if (ms === 0) {
      throw new Error(`Invalid split time "${timeStr}"`);
    }
    out.push({ distance, ms });
  }
  return out.length > 0 ? out : null;
}

export interface SplitRow {
  distance: number;
  cumulativeMs: number;
  deltaMs: number;
}

/** Cumulative time per split plus the per-segment delta (first delta = itself). */
export function splitRows(splits: SplitTime[]): SplitRow[] {
  return splits.map((s, i) => ({
    distance: s.distance,
    cumulativeMs: s.ms,
    deltaMs: i === 0 ? s.ms : s.ms - splits[i - 1].ms,
  }));
}
