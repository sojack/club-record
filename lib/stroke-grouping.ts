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
