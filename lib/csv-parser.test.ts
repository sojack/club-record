import { describe, it, expect } from "vitest";
import { parseRecordsCSV } from "./csv-parser";

describe("parseRecordsCSV — individual", () => {
  it("parses a basic row", () => {
    const csv = "Event,Time,Swimmer\n50 Free,24.56,John Smith";
    const { records, errors } = parseRecordsCSV(csv);
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].event_name).toBe("50 Free");
    expect(records[0].time_ms).toBe(24560);
    expect(records[0].swimmer_name).toBe("John Smith");
  });

  it("maps alternate column names", () => {
    const csv = "event_name,record_time,athlete\n100 Back,1:02.34,Jane Doe";
    const { records, errors } = parseRecordsCSV(csv);
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].time_ms).toBe(62340);
    expect(records[0].swimmer_name).toBe("Jane Doe");
  });

  it("parses booleans (x/yes/1/true) case-insensitively", () => {
    const csv =
      "Event,Time,Swimmer,wr,national\n" +
      "50 Free,24.56,A,x,NO\n" +
      "50 Back,30.00,B,true,1\n" +
      "50 Fly,28.00,C,YES,yes";
    const { records } = parseRecordsCSV(csv);
    expect(records[0].is_world_record).toBe(true);
    expect(records[0].is_national).toBe(false);
    expect(records[1].is_world_record).toBe(true);
    expect(records[1].is_national).toBe(true);
    expect(records[2].is_world_record).toBe(true);
    expect(records[2].is_national).toBe(true);
  });

  it("reports missing required fields with the human row number", () => {
    const csv = "Event,Time,Swimmer\n,24.56,A";
    const { records, errors } = parseRecordsCSV(csv);
    expect(records).toHaveLength(0);
    expect(errors).toContain(
      "Row 2: Missing required field (event, time, or swimmer)"
    );
  });

  // Depends on the Task 4 B3 fix
  it("rejects rows with an invalid time instead of importing NaN (B3)", () => {
    const csv = "Event,Time,Swimmer\n50 Free,abc,A";
    const { records, errors } = parseRecordsCSV(csv);
    expect(records).toHaveLength(0);
    expect(errors).toContain('Row 2: Invalid time format "abc"');
  });

  it("normalizes deterministic date formats", () => {
    const csv =
      "Event,Time,Swimmer,Date\nA,24.56,X,2024\nB,25.00,Y,2024-3\nC,26.00,Z,2024/03/15";
    const { records } = parseRecordsCSV(csv);
    expect(records[0].record_date).toBe("2024");
    expect(records[1].record_date).toBe("2024-03");
    expect(records[2].record_date).toBe("2024-03-15");
  });
});

describe("parseRecordsCSV — relay & scope", () => {
  it("requires all four swimmer names in relay mode", () => {
    const csv = "Event,Time,Name1,Name2,Name3,Name4\n4x50 Free,1:40.00,A,B,C,";
    const { records, errors } = parseRecordsCSV(csv, { relay: true });
    expect(records).toHaveLength(0);
    expect(errors).toContain(
      "Row 2: Relay records require all 4 swimmer names (Name1-Name4)"
    );
  });

  it("accepts a complete club-scope relay row", () => {
    const csv =
      "Event,Time,Name1,Name2,Name3,Name4\n4x50 Free,1:40.00,A,B,C,D";
    const { records, errors } = parseRecordsCSV(csv, {
      relay: true,
      scope: "club",
    });
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].swimmer_name).toBe("A");
    expect(records[0].swimmer_name_2).toBe("B");
    expect(records[0].swimmer_name_3).toBe("C");
    expect(records[0].swimmer_name_4).toBe("D");
    expect(records[0].age_group).toBeNull();
    expect(records[0].province).toBeNull();
  });

  it("requires a province for national-scope relay rows", () => {
    const csv =
      "Event,AgeGroup,Time,Name1,Name2,Name3,Name4,Club\n" +
      "4x50 Free,13-14,1:40.00,A,B,C,D,Sharks";
    const { records, errors } = parseRecordsCSV(csv, {
      relay: true,
      scope: "national",
    });
    expect(records).toHaveLength(0);
    expect(errors).toContain("Row 2: National records require a Province");
  });

  it("accepts a provincial-scope relay row (age group + club, no province)", () => {
    const csv =
      "Event,AgeGroup,Time,Name1,Name2,Name3,Name4,Club\n" +
      "4x50 Free,13-14,1:40.00,A,B,C,D,Sharks";
    const { records, errors } = parseRecordsCSV(csv, {
      relay: true,
      scope: "provincial",
    });
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0].age_group).toBe("13-14");
    expect(records[0].record_club).toBe("Sharks");
    expect(records[0].province).toBeNull();
  });

  it("rejects a provincial-scope row missing its club", () => {
    const csv =
      "Event,AgeGroup,Time,Name1,Name2,Name3,Name4\n" +
      "4x50 Free,13-14,1:40.00,A,B,C,D";
    const { records, errors } = parseRecordsCSV(csv, {
      relay: true,
      scope: "provincial",
    });
    expect(records).toHaveLength(0);
    expect(errors).toContain("Row 2: Provincial records require a Club");
  });
});

describe("parseRecordsCSV — free-form month-name dates", () => {
  function dateOf(dateField: string): string | null {
    const csv = `Event,Time,Swimmer,Date\n50 Free,24.56,John Smith,${dateField}`;
    const { records } = parseRecordsCSV(csv);
    return records[0].record_date;
  }

  it("parses 'Month YYYY' to YYYY-MM", () => {
    expect(dateOf("March 2024")).toBe("2024-03");
    expect(dateOf("Mar 2024")).toBe("2024-03");
  });

  it("parses 'Month D, YYYY' to YYYY-MM-DD", () => {
    expect(dateOf('"Mar 15, 2024"')).toBe("2024-03-15");
    expect(dateOf("March 5 2024")).toBe("2024-03-05");
  });

  it("parses 'D Month YYYY' to YYYY-MM-DD", () => {
    expect(dateOf("15 March 2024")).toBe("2024-03-15");
  });

  it("returns an impossible day as-is instead of rolling over", () => {
    expect(dateOf('"Feb 30, 2024"')).toBe("Feb 30, 2024");
  });

  it("validates leap-year February", () => {
    expect(dateOf('"Feb 29, 2024"')).toBe("2024-02-29");
    expect(dateOf('"Feb 29, 2023"')).toBe("Feb 29, 2023");
  });

  it("returns an unknown month name as-is", () => {
    expect(dateOf("Smarch 2024")).toBe("Smarch 2024");
  });
});
