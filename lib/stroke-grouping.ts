import type { SwimRecord } from "@/types/database";

export interface StrokeInfo {
  key: string;
  label: string;
  order: number;
}

export interface StrokeGroup {
  stroke: StrokeInfo;
  records: SwimRecord[];
}

export interface StrokeSection {
  band: string | null;
  strokeGroups: StrokeGroup[];
}

// Canonical swim order: Free -> Back -> Breast -> Fly -> IM.
export const STROKE_ORDER: StrokeInfo[] = [
  { key: "free", label: "Freestyle", order: 1 },
  { key: "back", label: "Backstroke", order: 2 },
  { key: "breast", label: "Breaststroke", order: 3 },
  { key: "fly", label: "Butterfly", order: 4 },
  { key: "im", label: "Individual Medley", order: 5 },
];

const STROKE_OTHER: StrokeInfo = { key: "other", label: "Other", order: 6 };

// Header shown for records with no age group; also the map key for that bucket.
export const BLANK_BAND = "—";

// Order of checks matters so e.g. "Backstroke" never matches "free".
export function detectStroke(eventName: string): StrokeInfo {
  const s = (eventName || "").toLowerCase();
  if (s.includes("back")) return STROKE_ORDER[1];
  if (s.includes("breast")) return STROKE_ORDER[2];
  if (s.includes("fly") || s.includes("butterfly")) return STROKE_ORDER[3];
  if (s.includes("medley") || /\bim\b/.test(s)) return STROKE_ORDER[4];
  if (s.includes("free")) return STROKE_ORDER[0];
  return STROKE_OTHER;
}

export function groupRecordsByStroke(records: SwimRecord[]): StrokeGroup[] {
  const byKey = new Map<string, StrokeGroup>();
  for (const record of records) {
    const stroke = detectStroke(record.event_name);
    const existing = byKey.get(stroke.key);
    if (existing) {
      existing.records.push(record);
    } else {
      byKey.set(stroke.key, { stroke, records: [record] });
    }
  }
  return Array.from(byKey.values()).sort(
    (a, b) => a.stroke.order - b.stroke.order
  );
}

// First numeric value in a band label drives ascending order; blank/none last.
export function ageBandKey(band: string | null): number {
  if (!band) return Number.MAX_SAFE_INTEGER;
  const m = band.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
}

export function buildStrokeSections(
  records: SwimRecord[],
  hasBands: boolean
): StrokeSection[] {
  if (!hasBands) {
    return [{ band: null, strokeGroups: groupRecordsByStroke(records) }];
  }
  const byBand = new Map<string, SwimRecord[]>();
  for (const r of records) {
    const band = (r.age_group && r.age_group.trim()) || BLANK_BAND;
    const arr = byBand.get(band) || [];
    arr.push(r);
    byBand.set(band, arr);
  }
  return Array.from(byBand.entries())
    .sort(
      (a, b) =>
        ageBandKey(a[0] === BLANK_BAND ? null : a[0]) -
        ageBandKey(b[0] === BLANK_BAND ? null : b[0])
    )
    .map(([band, recs]) => ({ band, strokeGroups: groupRecordsByStroke(recs) }));
}
