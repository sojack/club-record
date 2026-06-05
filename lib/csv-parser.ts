import Papa from "papaparse";
import { parseTimeToMs } from "./time-utils";

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/**
 * Deterministically parse English free-form month-name dates without `new Date`,
 * so the result never depends on timezone and impossible days never roll over.
 * Returns "YYYY-MM" / "YYYY-MM-DD", or null if `trimmed` is not a recognized
 * month-name date.
 */
function parseMonthNameDate(trimmed: string): string | null {
  const lower = trimmed.toLowerCase();
  const pad = (n: number) => String(n).padStart(2, "0");

  // "March 2024" / "Mar 2024" -> YYYY-MM
  let m = lower.match(/^([a-z]+)\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    return month ? `${m[2]}-${pad(month)}` : null;
  }

  // "Mar 15, 2024" / "March 5 2024" -> YYYY-MM-DD
  m = lower.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1]];
    const day = Number(m[2]);
    const year = Number(m[3]);
    if (month && day >= 1 && day <= daysInMonth(year, month)) {
      return `${m[3]}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  // "15 March 2024" -> YYYY-MM-DD
  m = lower.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (m) {
    const month = MONTHS[m[2]];
    const day = Number(m[1]);
    const year = Number(m[3]);
    if (month && day >= 1 && day <= daysInMonth(year, month)) {
      return `${m[3]}-${pad(month)}-${pad(day)}`;
    }
    return null;
  }

  return null;
}

/**
 * Normalize date strings to consistent format
 * Keeps partial dates as-is: "2024", "2024-03", "2024-03-15"
 */
function normalizeDate(value: string | undefined): string | null {
  if (!value || !value.trim()) return null;

  const trimmed = value.trim();

  // Year only: "2024" - keep as-is
  if (/^\d{4}$/.test(trimmed)) {
    return trimmed;
  }

  // Year and month: normalize to "YYYY-MM" format
  const yearMonthMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})$/);
  if (yearMonthMatch) {
    const year = yearMonthMatch[1];
    const month = yearMonthMatch[2].padStart(2, "0");
    return `${year}-${month}`;
  }

  // Full date: normalize to "YYYY-MM-DD" format
  const fullDateMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (fullDateMatch) {
    const year = fullDateMatch[1];
    const month = fullDateMatch[2].padStart(2, "0");
    const day = fullDateMatch[3].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Free-form English month-name dates, parsed deterministically (no `new Date`,
  // so no timezone shift and no silent rollover of impossible days).
  const monthName = parseMonthNameDate(trimmed);
  if (monthName) return monthName;

  // Return as-is if we can't parse
  return trimmed;
}

export interface CSVRecord {
  event_name: string;
  time_ms: number;
  swimmer_name: string;
  swimmer_name_2: string | null;
  swimmer_name_3: string | null;
  swimmer_name_4: string | null;
  age_group: string | null;
  record_club: string | null;
  province: string | null;
  record_date: string | null;
  location: string | null;
  is_national: boolean;
  is_current_national: boolean;
  is_provincial: boolean;
  is_current_provincial: boolean;
  is_split: boolean;
  is_relay_split: boolean;
  is_new: boolean;
  is_world_record: boolean;
}

interface RawCSVRow {
  [key: string]: string;
}

export interface RelayParseOptions {
  relay?: boolean;
  scope?: "club" | "provincial" | "national";
  /** Allowed standard age-group names; when provided, non-matching rows error. */
  allowedAgeGroups?: string[];
}

/**
 * Parse a CSV file and convert to record format
 * Expected columns: Event, Time, Swimmer, Date (optional), Location (optional)
 */
export function parseRecordsCSV(
  csvContent: string,
  relayOptions: RelayParseOptions = {}
): {
  records: CSVRecord[];
  errors: string[];
} {
  const errors: string[] = [];
  const records: CSVRecord[] = [];

  const result = Papa.parse<RawCSVRow>(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim().toLowerCase(),
  });

  if (result.errors.length > 0) {
    result.errors.forEach((err) => {
      errors.push(`Row ${err.row}: ${err.message}`);
    });
  }

  // Map column names (support variations)
  const columnMaps = {
    event: ["event", "event_name", "eventname"],
    time: ["time", "time_ms", "record_time"],
    swimmer: ["swimmer", "swimmer_name", "swimmername", "name", "name1", "athlete"],
    date: ["date", "record_date", "recorddate"],
    location: ["location", "meet", "venue"],
    is_national: ["is_national", "national", "canadian_record"],
    is_current_national: ["is_current_national", "current_national", "current_canadian"],
    is_provincial: ["is_provincial", "provincial", "provincial_record"],
    is_current_provincial: ["is_current_provincial", "current_provincial"],
    is_split: ["is_split", "split", "split_time"],
    is_relay_split: ["is_relay_split", "relay_split", "relay"],
    is_new: ["is_new", "new", "new_record"],
    is_world_record: ["is_world_record", "world_record", "world", "wr"],
    swimmer2: ["name2", "swimmer2", "swimmer_name_2", "name_2"],
    swimmer3: ["name3", "swimmer3", "swimmer_name_3", "name_3"],
    swimmer4: ["name4", "swimmer4", "swimmer_name_4", "name_4"],
    age_group: ["agegroup", "age_group", "age group", "age"],
    record_club: ["club", "record_club", "team"],
    province: ["province", "prov", "state"],
  };

  const parseBoolean = (value: string | undefined): boolean => {
    if (!value) return false;
    const lower = value.toLowerCase().trim();
    return lower === "true" || lower === "yes" || lower === "1" || lower === "x";
  };

  const findColumn = (row: RawCSVRow, options: string[]): string | undefined => {
    for (const opt of options) {
      if (row[opt] !== undefined) {
        return row[opt];
      }
    }
    return undefined;
  };

  result.data.forEach((row, index) => {
    const event = findColumn(row, columnMaps.event);
    const time = findColumn(row, columnMaps.time);
    const swimmer = findColumn(row, columnMaps.swimmer);
    const date = findColumn(row, columnMaps.date);
    const location = findColumn(row, columnMaps.location);
    const is_national = findColumn(row, columnMaps.is_national);
    const is_current_national = findColumn(row, columnMaps.is_current_national);
    const is_provincial = findColumn(row, columnMaps.is_provincial);
    const is_current_provincial = findColumn(row, columnMaps.is_current_provincial);
    const is_split = findColumn(row, columnMaps.is_split);
    const is_relay_split = findColumn(row, columnMaps.is_relay_split);
    const is_new = findColumn(row, columnMaps.is_new);
    const is_world_record = findColumn(row, columnMaps.is_world_record);

    const isRelay = relayOptions.relay === true;
    const name2 = findColumn(row, columnMaps.swimmer2);
    const name3 = findColumn(row, columnMaps.swimmer3);
    const name4 = findColumn(row, columnMaps.swimmer4);
    const ageGroup = findColumn(row, columnMaps.age_group);
    const recordClub = findColumn(row, columnMaps.record_club);
    const province = findColumn(row, columnMaps.province);

    if (!event || !time || !swimmer) {
      errors.push(
        `Row ${index + 2}: Missing required field (event, time, or swimmer)`
      );
      return;
    }

    const time_ms = parseTimeToMs(time);
    if (time_ms === 0) {
      errors.push(`Row ${index + 2}: Invalid time format "${time}"`);
      return;
    }

    const rawScope = relayOptions.scope;
    const scope =
      rawScope === "national"
        ? "national"
        : rawScope === "provincial"
        ? "provincial"
        : "club";
    const carriesAgeClub = scope !== "club"; // provincial + national
    const carriesProvince = scope === "national";

    if (isRelay) {
      if (!name2?.trim() || !name3?.trim() || !name4?.trim()) {
        errors.push(
          `Row ${index + 2}: Relay records require all 4 swimmer names (Name1-Name4)`
        );
        return;
      }
      if (
        relayOptions.allowedAgeGroups &&
        relayOptions.allowedAgeGroups.length > 0 &&
        ageGroup?.trim() &&
        !relayOptions.allowedAgeGroups.includes(ageGroup.trim())
      ) {
        errors.push(
          `Row ${index + 2}: Age Group "${ageGroup.trim()}" is not a standard age group`
        );
        return;
      }
    }

    if (carriesAgeClub) {
      if (!ageGroup?.trim()) {
        errors.push(
          `Row ${index + 2}: ${scope === "national" ? "National" : "Provincial"} records require an Age Group`
        );
        return;
      }
      if (!recordClub?.trim()) {
        errors.push(
          `Row ${index + 2}: ${scope === "national" ? "National" : "Provincial"} records require a Club`
        );
        return;
      }
      if (carriesProvince && !province?.trim()) {
        errors.push(
          `Row ${index + 2}: National records require a Province`
        );
        return;
      }
    }

    records.push({
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
      swimmer_name_2: isRelay ? name2!.trim() : null,
      swimmer_name_3: isRelay ? name3!.trim() : null,
      swimmer_name_4: isRelay ? name4!.trim() : null,
      age_group: carriesAgeClub ? ageGroup!.trim() : null,
      record_club: carriesAgeClub ? recordClub!.trim() : null,
      province: carriesProvince ? province!.trim() : null,
      record_date: normalizeDate(date),
      location: location?.trim() || null,
      is_national: parseBoolean(is_national),
      is_current_national: parseBoolean(is_current_national),
      is_provincial: parseBoolean(is_provincial),
      is_current_provincial: parseBoolean(is_current_provincial),
      is_split: parseBoolean(is_split),
      is_relay_split: parseBoolean(is_relay_split),
      is_new: parseBoolean(is_new),
      is_world_record: parseBoolean(is_world_record),
    });
  });

  return { records, errors };
}

export interface RelayTemplateOptions {
  relay?: boolean;
  scope?: "club" | "provincial" | "national";
  ageGroups?: string[];
  relayEvents?: string[];
}

/**
 * Generate a CSV template string. Relay variant emits relay columns and one
 * blank row per age group per relay event (mirrors how the individual
 * sample CSV pre-fills events).
 */
export function generateCSVTemplate(options: RelayTemplateOptions = {}): string {
  if (!options.relay) {
    const headers = ["Event", "Time", "Swimmer", "Date", "Location", "is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"];
    const exampleRow = ["50 Free", "24.56", "John Smith", "2024-03-15", "City Championships", "", "", "", "", "", "", "", ""];
    return [headers.join(","), exampleRow.join(",")].join("\n");
  }

  const wantsClub =
    options.scope === "provincial" ||
    options.scope === "national";
  const wantsProvince =
    options.scope === "national";
  const headers = [
    "Event", "AgeGroup", "Time", "Name1", "Name2", "Name3", "Name4",
    ...(wantsClub ? ["Club"] : []),
    ...(wantsProvince ? ["Province"] : []),
    "Date", "Location",
    "is_World_Record", "is_National", "is_Current_National",
    "is_Provincial", "is_Current_Provincial", "is_New",
  ];
  const events = options.relayEvents?.length
    ? options.relayEvents
    : ["4 X 50 Freestyle Relay"];
  const ageGroups = options.ageGroups?.length ? options.ageGroups : [""];
  const rows = events.flatMap((ev) =>
    ageGroups.map((ag) =>
      [ev, ag, ...Array(headers.length - 2).fill("")].join(",")
    )
  );
  return [headers.join(","), ...rows].join("\n");
}
