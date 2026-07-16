import Papa from "papaparse";
import type { RecordList, SwimRecord } from "@/types/database";
import { formatMsToTime } from "@/lib/time-utils";
import { formatSplitsColumn } from "@/lib/split-utils";
import { parseRecordRow, type RawCSVRow, type CSVRecord } from "@/lib/csv-parser";
import type { ListScope } from "@/lib/scope";

/** Header order for the combined export/import CSV. */
export const COMBINED_COLUMNS = [
  "List Title", "Course", "Gender", "Record Type", "List Slug",
  "Record ID", "Is Current", "Superseded By",
  "Event", "AgeGroup", "Time", "Swimmer", "Name2", "Name3", "Name4",
  "Club", "Province", "Date", "Location",
  "is_World_Record", "is_National", "is_Current_National",
  "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit",
  "is_New", "Splits",
] as const;

const flag = (b: boolean): string => (b ? "x" : "");

function rowFor(list: RecordList, r: SwimRecord): Record<string, string> {
  return {
    "List Title": list.title,
    "Course": list.course_type,
    "Gender": list.gender ?? "",
    "Record Type": list.record_type,
    "List Slug": list.slug,
    "Record ID": r.id,
    "Is Current": flag(r.is_current),
    "Superseded By": r.superseded_by ?? "",
    "Event": r.event_name,
    "AgeGroup": r.age_group ?? "",
    "Time": formatMsToTime(r.time_ms),
    "Swimmer": r.swimmer_name,
    "Name2": r.swimmer_name_2 ?? "",
    "Name3": r.swimmer_name_3 ?? "",
    "Name4": r.swimmer_name_4 ?? "",
    "Club": r.record_club ?? "",
    "Province": r.province ?? "",
    "Date": r.record_date ?? "",
    "Location": r.location ?? "",
    "is_World_Record": flag(r.is_world_record),
    "is_National": flag(r.is_national),
    "is_Current_National": flag(r.is_current_national),
    "is_Provincial": flag(r.is_provincial),
    "is_Current_Provincial": flag(r.is_current_provincial),
    "is_Split": flag(r.is_split),
    "is_RelaySplit": flag(r.is_relay_split),
    "is_New": flag(r.is_new),
    "Splits": formatSplitsColumn(r.split_times),
  };
}

/**
 * Build the combined club CSV: one row per record (current AND history),
 * grouped by list, in the given orders. Robust quoting via Papa.unparse.
 */
export function buildCombinedCsv(
  lists: RecordList[],
  recordsByList: Map<string, SwimRecord[]>
): string {
  const rows: Record<string, string>[] = [];
  for (const list of lists) {
    for (const r of recordsByList.get(list.id) ?? []) {
      rows.push(rowFor(list, r));
    }
  }
  return Papa.unparse({ fields: [...COMBINED_COLUMNS], data: rows }, { newline: "\n" });
}

export interface CombinedRow {
  recordId: string | null;
  isCurrent: boolean;
  supersededBy: string | null;
  record: CSVRecord;
}

export interface CombinedGroup {
  slug: string;
  title: string;
  courseType: "SCM" | "SCY" | "LCM";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  rows: CombinedRow[];
}

const truthy = (v: string | undefined): boolean => {
  const s = (v ?? "").toLowerCase().trim();
  return s === "x" || s === "true" || s === "yes" || s === "1";
};

const asCourse = (v: string | undefined): "SCM" | "SCY" | "LCM" => {
  const u = (v ?? "").toUpperCase().trim();
  return u === "SCM" || u === "SCY" ? u : "LCM";
};

const asGender = (v: string | undefined): "male" | "female" | "mixed" | null => {
  const s = (v ?? "").toLowerCase().trim();
  return s === "male" || s === "female" || s === "mixed" ? s : null;
};

/**
 * Parse a combined CSV (as emitted by `buildCombinedCsv`) back into per-list
 * groups of rows, using each row's `List Slug` column for grouping.
 */
export function parseCombinedCsv(
  csvContent: string,
  scope: ListScope
): { groups: CombinedGroup[]; errors: string[] } {
  const errors: string[] = [];
  const parsed = Papa.parse<RawCSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  parsed.errors.forEach((e) => errors.push(`Row ${e.row}: ${e.message}`));

  const bySlug = new Map<string, CombinedGroup>();

  parsed.data.forEach((row, index) => {
    const slug = (row["list slug"] ?? "").trim();
    const recordType: "individual" | "relay" =
      (row["record type"] ?? "").trim().toLowerCase() === "relay" ? "relay" : "individual";

    const { record, error } = parseRecordRow(row, { relay: recordType === "relay", scope }, index + 2);
    if (error) {
      errors.push(error);
      return;
    }
    if (!record) return;

    let group = bySlug.get(slug);
    if (!group) {
      group = {
        slug,
        title: (row["list title"] ?? "").trim(),
        courseType: asCourse(row["course"]),
        gender: asGender(row["gender"]),
        recordType,
        rows: [],
      };
      bySlug.set(slug, group);
    }

    const recordId = (row["record id"] ?? "").trim() || null;
    const supersededBy = (row["superseded by"] ?? "").trim() || null;
    // Default missing "Is Current" to true so hand-authored files (no linkage
    // columns) treat every row as a live record.
    const isCurrent = row["is current"] === undefined ? true : truthy(row["is current"]);

    group.rows.push({ recordId, isCurrent, supersededBy, record });
  });

  return { groups: [...bySlug.values()], errors };
}

export type RecordOp =
  | { kind: "update"; id: string; fields: CSVRecord }
  | { kind: "insert"; fields: CSVRecord; sortOrder: number }
  | { kind: "supersede"; oldId: string; fields: CSVRecord; sortOrder: number };

export interface CreateRow {
  fields: CSVRecord;
  isCurrent: boolean;
  /** Stable id local to this create batch, used to link history to its winner. */
  localId: string;
  /** localId of the current record this history row belongs to (null if current). */
  supersededByLocalId: string | null;
  sortOrder: number;
}

export interface ListPlan {
  slug: string;
  title: string;
  courseType: "SCM" | "SCY" | "LCM";
  gender: "male" | "female" | "mixed" | null;
  recordType: "individual" | "relay";
  scope: ListScope;
  action: "update" | "create";
  ops: RecordOp[]; // action === "update"
  createRows: CreateRow[]; // action === "create"
  flags: string[]; // human-readable warnings for the preview
}

const slotKey = (r: { event_name: string; age_group: string | null }): string =>
  `${r.event_name.toLowerCase().trim()}|${r.age_group ?? ""}`;

/**
 * Plan how a parsed combined-CSV group should be reconciled against the
 * database: for a brand-new list, every row becomes a `CreateRow` (current
 * rows first, history rows linked via their CSV-local id); for an existing
 * list, each row becomes an update/insert/supersede `RecordOp`. Never emits
 * a delete — existing records absent from the CSV simply produce no op.
 */
export function planReconciliation(
  group: CombinedGroup,
  existingList: { id: string } | null,
  existingRecords: SwimRecord[],
  scope: ListScope
): ListPlan {
  const base = {
    slug: group.slug, title: group.title, courseType: group.courseType,
    gender: group.gender, recordType: group.recordType, scope,
  };

  if (!existingList) {
    const flags: string[] = [];
    const isSplit = (r: CSVRecord) => r.is_split || r.is_relay_split;
    const items = group.rows.map((row, i) => ({ ...row, localId: `c${i}` }));

    // Winner per slot = the fastest CURRENT non-split row. Any other non-split
    // row in that slot (a slower current row, or an existing history row)
    // becomes history under the winner — so a break represented as two current
    // rows resolves correctly even when creating a brand-new list. Split-time
    // records are left exactly as marked (they legitimately coexist).
    const winnerBySlot = new Map<string, { localId: string; time_ms: number }>();
    for (const it of items) {
      if (isSplit(it.record) || !it.isCurrent) continue;
      const k = slotKey(it.record);
      const w = winnerBySlot.get(k);
      if (!w || it.record.time_ms < w.time_ms) {
        winnerBySlot.set(k, { localId: it.localId, time_ms: it.record.time_ms });
      }
    }
    // A row stays current iff it is marked current AND is either a split (always
    // kept) or the fastest current in its slot (the winner).
    const staysCurrent = (it: (typeof items)[number]): boolean => {
      if (!it.isCurrent) return false;
      if (isSplit(it.record)) return true;
      const w = winnerBySlot.get(slotKey(it.record));
      return !!w && w.localId === it.localId;
    };

    // Explicit CSV superseded_by links, resolved to the local id of a row that
    // actually stays current (used for split history rows that carry no slot
    // winner). Demoted break-losers are excluded so they never become a parent.
    const localByCsvId = new Map<string, string>();
    for (const it of items) {
      if (it.recordId && staysCurrent(it)) localByCsvId.set(it.recordId, it.localId);
    }

    const createRows: CreateRow[] = [];
    let ordinal = 0;
    for (const it of items) {
      const winner = isSplit(it.record) ? undefined : winnerBySlot.get(slotKey(it.record));
      if (staysCurrent(it)) {
        createRows.push({
          fields: it.record, isCurrent: true, localId: it.localId,
          supersededByLocalId: null, sortOrder: ordinal++,
        });
        continue;
      }
      // History row: link to its slot winner, else an explicit CSV parent.
      let parent: string | null = null;
      if (winner) parent = winner.localId;
      else if (it.supersededBy && localByCsvId.has(it.supersededBy)) {
        parent = localByCsvId.get(it.supersededBy)!;
      }
      if (!parent) {
        flags.push(`history row for ${it.record.event_name} has no matching current record — skipped`);
        continue;
      }
      createRows.push({
        fields: it.record, isCurrent: false, localId: it.localId,
        supersededByLocalId: parent, sortOrder: 0,
      });
    }
    return { ...base, action: "create", ops: [], createRows, flags };
  }

  const byId = new Map(existingRecords.map((r) => [r.id, r]));
  const currentBySlot = new Map<string, SwimRecord[]>();
  const allBySlot = new Map<string, SwimRecord[]>();
  for (const r of existingRecords) {
    const k = slotKey(r);
    allBySlot.set(k, [...(allBySlot.get(k) ?? []), r]);
    if (r.is_current) currentBySlot.set(k, [...(currentBySlot.get(k) ?? []), r]);
  }
  let appendCounter = existingRecords.reduce((m, r) => Math.max(m, r.sort_order), -1) + 1;
  const supersededOldIds = new Set<string>();
  const ops: RecordOp[] = [];
  const flags: string[] = [];

  for (const row of group.rows) {
    if (row.recordId && byId.has(row.recordId)) {
      const existing = byId.get(row.recordId)!;
      if (existing.time_ms !== row.record.time_ms) {
        flags.push(
          `${row.record.event_name}: time changed on an existing record — updated in place with no history kept (a correction, not a new record)`
        );
      }
      ops.push({ kind: "update", id: row.recordId, fields: row.record });
      continue;
    }
    // Safety net: an id-less row that exactly matches an EXISTING record in its
    // slot (by time + swimmer) is that same record re-listed without its Record
    // ID (e.g. an edit dropped the linkage columns). If it matches the live
    // record, update in place; if it matches a record that is already history,
    // it exists — no-op. This prevents both duplicating a record and
    // resurrecting a broken/history record as a new current event.
    const slot = slotKey(row.record);
    const existingMatch = (allBySlot.get(slot) ?? []).find(
      (r) => r.time_ms === row.record.time_ms && r.swimmer_name === row.record.swimmer_name
    );
    if (existingMatch) {
      if (existingMatch.is_current) {
        ops.push({ kind: "update", id: existingMatch.id, fields: row.record });
      }
      continue;
    }
    // A history row with no id and no matching record is a genuine orphan.
    if (!row.isCurrent) {
      flags.push(`history row for ${row.record.event_name} has no matching record — skipped`);
      continue;
    }
    const inSlot = currentBySlot.get(slot) ?? [];
    if (inSlot.length === 1 && row.record.time_ms < inSlot[0].time_ms) {
      if (supersededOldIds.has(inSlot[0].id)) {
        flags.push(`multiple new records break the same record (${row.record.event_name}) — added as new instead`);
        ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
      } else {
        supersededOldIds.add(inSlot[0].id);
        ops.push({ kind: "supersede", oldId: inSlot[0].id, fields: row.record, sortOrder: inSlot[0].sort_order });
      }
    } else if (inSlot.length === 1) {
      flags.push(`${row.record.event_name}: new time is not faster than the current record — added as a separate record`);
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    } else if (inSlot.length === 0) {
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    } else {
      flags.push(`${row.record.event_name} (${row.record.age_group ?? "no age group"}): more than one current record in this slot — added as new, not auto-superseded`);
      ops.push({ kind: "insert", fields: row.record, sortOrder: appendCounter++ });
    }
  }
  return { ...base, action: "update", ops, createRows: [], flags };
}
