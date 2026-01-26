import Papa from "papaparse";
import { parseTimeToMs } from "./time-utils";

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

  // Try to parse other formats like "March 2024" or "Mar 15, 2024"
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    // If original didn't have a day, return year-month only
    if (/^[a-zA-Z]+\s+\d{4}$/.test(trimmed)) {
      return `${year}-${month}`;
    }
    return `${year}-${month}-${day}`;
  }

  // Return as-is if we can't parse
  return trimmed;
}

export interface CSVRecord {
  event_name: string;
  time_ms: number;
  swimmer_name: string;
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

/**
 * Parse a CSV file and convert to record format
 * Expected columns: Event, Time, Swimmer, Date (optional), Location (optional)
 */
export function parseRecordsCSV(csvContent: string): {
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
    swimmer: ["swimmer", "swimmer_name", "swimmername", "name", "athlete"],
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

    records.push({
      event_name: event.trim(),
      time_ms,
      swimmer_name: swimmer.trim(),
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

/**
 * Generate a CSV template string
 */
export function generateCSVTemplate(): string {
  const headers = ["Event", "Time", "Swimmer", "Date", "Location", "is_World_Record", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"];
  const exampleRow = ["50 Free", "24.56", "John Smith", "2024-03-15", "City Championships", "", "", "", "", "", "", "", ""];
  return [headers.join(","), exampleRow.join(",")].join("\n");
}
