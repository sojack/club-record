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
