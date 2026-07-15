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
  csvRecordId: string | null;
  supersededByCsvId: string | null;
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
    const createRows: CreateRow[] = [];
    const currentCsvIds = new Set(
      group.rows.filter((r) => r.isCurrent && r.recordId).map((r) => r.recordId as string)
    );
    let ordinal = 0;
    for (const row of group.rows) {
      if (row.isCurrent) {
        createRows.push({
          fields: row.record, isCurrent: true, csvRecordId: row.recordId,
          supersededByCsvId: null, sortOrder: ordinal++,
        });
      } else {
        if (!row.supersededBy || !currentCsvIds.has(row.supersededBy)) {
          flags.push(`history row for ${row.record.event_name} has no matching current record — skipped`);
          continue;
        }
        createRows.push({
          fields: row.record, isCurrent: false, csvRecordId: row.recordId,
          supersededByCsvId: row.supersededBy, sortOrder: 0,
        });
      }
    }
    return { ...base, action: "create", ops: [], createRows, flags };
  }

  const byId = new Map(existingRecords.map((r) => [r.id, r]));
  const currentBySlot = new Map<string, SwimRecord[]>();
  for (const r of existingRecords) {
    if (!r.is_current) continue;
    const k = slotKey(r);
    currentBySlot.set(k, [...(currentBySlot.get(k) ?? []), r]);
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
    if (!row.isCurrent) {
      flags.push(`history row for ${row.record.event_name} has no matching record — skipped`);
      continue;
    }
    const inSlot = currentBySlot.get(slotKey(row.record)) ?? [];
    // Safety net: an id-less current row that exactly matches an existing
    // current record in its slot (same time and swimmer) is the SAME record
    // re-listed without its Record ID (e.g. an AI edit dropped the column) —
    // update it in place instead of inserting a duplicate.
    const exactMatch = inSlot.find(
      (r) => r.time_ms === row.record.time_ms && r.swimmer_name === row.record.swimmer_name
    );
    if (exactMatch) {
      ops.push({ kind: "update", id: exactMatch.id, fields: row.record });
      continue;
    }
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
