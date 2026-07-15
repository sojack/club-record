import Papa from "papaparse";
import type { RecordList, SwimRecord } from "@/types/database";
import { formatMsToTime } from "@/lib/time-utils";
import { formatSplitsColumn } from "@/lib/split-utils";

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
