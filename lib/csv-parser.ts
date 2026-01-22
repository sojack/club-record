import Papa from "papaparse";
import { parseTimeToMs } from "./time-utils";

export interface CSVRecord {
  event_name: string;
  time_ms: number;
  swimmer_name: string;
  record_date: string | null;
  location: string | null;
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
      record_date: date?.trim() || null,
      location: location?.trim() || null,
    });
  });

  return { records, errors };
}

/**
 * Generate a CSV template string
 */
export function generateCSVTemplate(): string {
  const headers = ["Event", "Time", "Swimmer", "Date", "Location"];
  const exampleRow = ["50 Free", "24.56", "John Smith", "2024-03-15", "City Championships"];
  return [headers.join(","), exampleRow.join(",")].join("\n");
}
