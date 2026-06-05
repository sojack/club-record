import type { SwimRecord } from "@/types/database";

export interface EditableRecord
  extends Omit<SwimRecord, "id" | "created_at" | "updated_at" | "record_list_id"> {
  id?: string;
  isNew?: boolean;
  _breakingRecordId?: string;
}

export type RecordFlagType =
  | "is_national"
  | "is_current_national"
  | "is_provincial"
  | "is_current_provincial"
  | "is_split"
  | "is_relay_split"
  | "is_new"
  | "is_world_record";

export interface HistoryFlagUpdate {
  id: string;
  flags: Record<RecordFlagType, boolean>;
}

export function getStandardEvents(courseType?: string): string[] {
  const events = [
    "50 Free", "100 Free", "200 Free", "400 Free", "800 Free", "1500 Free",
    "50 Back", "100 Back", "200 Back",
    "50 Breast", "100 Breast", "200 Breast",
    "50 Fly", "100 Fly", "200 Fly",
  ];
  if (courseType !== "LCM") {
    events.push("100 IM");
  }
  events.push("200 IM", "400 IM");
  return events;
}

export function mapRecordToEditable(r: SwimRecord): EditableRecord {
  return {
    id: r.id,
    event_name: r.event_name,
    time_ms: r.time_ms,
    swimmer_name: r.swimmer_name,
    swimmer_name_2: r.swimmer_name_2,
    swimmer_name_3: r.swimmer_name_3,
    swimmer_name_4: r.swimmer_name_4,
    age_group: r.age_group,
    record_club: r.record_club,
    province: r.province,
    record_date: r.record_date,
    location: r.location,
    split_times: r.split_times,
    sort_order: r.sort_order,
    is_national: r.is_national || false,
    is_current_national: r.is_current_national || false,
    is_provincial: r.is_provincial || false,
    is_current_provincial: r.is_current_provincial || false,
    is_split: r.is_split || false,
    is_relay_split: r.is_relay_split || false,
    is_new: r.is_new || false,
    is_world_record: r.is_world_record || false,
    superseded_by: r.superseded_by,
    is_current: r.is_current ?? true,
  };
}

export function makeEmptyRecord(sortOrder: number): EditableRecord {
  return {
    event_name: "",
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    split_times: null,
    sort_order: sortOrder,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    isNew: true,
  };
}

export function makeBreakingRecord(oldRecord: EditableRecord): EditableRecord {
  return {
    event_name: oldRecord.event_name,
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    split_times: null,
    sort_order: oldRecord.sort_order,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: true,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    isNew: true,
    _breakingRecordId: oldRecord.id,
  };
}

export function buildStandardEventRows(opts: {
  isRelay: boolean;
  courseType?: "LCM" | "SCM" | "SCY";
  relayEvents: string[];
  ageGroups: string[];
  existing: EditableRecord[];
  startSortOrder: number;
}): EditableRecord[] {
  const { isRelay, courseType, relayEvents, ageGroups, existing, startSortOrder } = opts;
  const standardEvents = isRelay
    ? relayEvents.flatMap((ev) => ageGroups.map((ag) => ({ event: ev, ageGroup: ag })))
    : getStandardEvents(courseType).map((event) => ({ event, ageGroup: null as string | null }));
  const existingKeys = new Set(
    existing.map((r) => `${r.event_name.toLowerCase()}|${r.age_group ?? ""}`)
  );
  const newPairs = standardEvents.filter(
    ({ event, ageGroup }) =>
      !existingKeys.has(`${event.toLowerCase()}|${ageGroup ?? ""}`)
  );

  return newPairs.map(({ event, ageGroup }, i) => ({
    event_name: event,
    time_ms: 0,
    swimmer_name: "",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: ageGroup,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    split_times: null,
    sort_order: startSortOrder + i,
    is_national: false,
    is_current_national: false,
    is_provincial: false,
    is_current_provincial: false,
    is_split: false,
    is_relay_split: false,
    is_new: false,
    is_world_record: false,
    superseded_by: null,
    is_current: true,
    isNew: true,
  }));
}

export function buildHistoryMap(records: SwimRecord[]): Map<string, SwimRecord[]> {
  const historyRecords = records.filter((r) => r.is_current === false);
  const historyByRecordId = new Map<string, SwimRecord[]>();
  historyRecords.forEach((hr) => {
    if (hr.superseded_by) {
      const existing = historyByRecordId.get(hr.superseded_by) || [];
      existing.push(hr);
      historyByRecordId.set(hr.superseded_by, existing);
    }
  });
  historyByRecordId.forEach((recs, key) => {
    recs.sort((a, b) => {
      if (!a.record_date && !b.record_date) return 0;
      if (!a.record_date) return 1;
      if (!b.record_date) return -1;
      return b.record_date.localeCompare(a.record_date);
    });
    historyByRecordId.set(key, recs);
  });
  return historyByRecordId;
}

export function filterSavableRecords(records: EditableRecord[]): EditableRecord[] {
  return records.filter((r) => r.event_name.trim() !== "");
}

export function buildHistoryUpdates(
  edited: Map<string, SwimRecord>
): HistoryFlagUpdate[] {
  return Array.from(edited.entries()).map(([id, record]) => ({
    id,
    flags: {
      is_national: record.is_national || false,
      is_current_national: record.is_current_national || false,
      is_provincial: record.is_provincial || false,
      is_current_provincial: record.is_current_provincial || false,
      is_split: record.is_split || false,
      is_relay_split: record.is_relay_split || false,
      is_new: record.is_new || false,
      is_world_record: record.is_world_record || false,
    },
  }));
}

export function getColumnConfig(opts: {
  recordType: "individual" | "relay";
  scope: "club" | "provincial" | "national";
}): { isRelay: boolean; showHolderClub: boolean; showProvince: boolean; showAgeGroup: boolean } {
  const isRelay = opts.recordType === "relay";
  const showHolderClub = opts.scope !== "club";
  const showProvince = opts.scope === "national";
  const showAgeGroup = isRelay || showHolderClub;
  return { isRelay, showHolderClub, showProvince, showAgeGroup };
}

export function computeAgeGroupOptions(
  ageGroups: string[],
  records: SwimRecord[]
): string[] {
  return Array.from(
    new Set([
      ...ageGroups,
      ...records
        .map((r) => r.age_group)
        .filter((a): a is string => !!a && a.trim() !== ""),
    ])
  );
}

export function reorderRecords(
  records: EditableRecord[],
  index: number,
  direction: "up" | "down"
): EditableRecord[] {
  if (
    (direction === "up" && index === 0) ||
    (direction === "down" && index === records.length - 1)
  ) {
    return records; // bounds no-op: same reference, caller skips the update
  }
  const newRecords = [...records];
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  [newRecords[index], newRecords[targetIndex]] = [
    newRecords[targetIndex],
    newRecords[index],
  ];
  newRecords.forEach((r, i) => {
    r.sort_order = i;
  });
  return newRecords;
}
