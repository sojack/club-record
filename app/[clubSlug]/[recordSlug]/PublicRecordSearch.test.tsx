// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SwimRecord } from "@/types/database";
import PublicRecordSearch from "./PublicRecordSearch";

function rec(overrides: Partial<SwimRecord> = {}): SwimRecord {
  return {
    id: "r1",
    record_list_id: "list-1",
    event_name: "50 Free",
    time_ms: 24560,
    swimmer_name: "John Smith",
    swimmer_name_2: null,
    swimmer_name_3: null,
    swimmer_name_4: null,
    age_group: null,
    record_club: null,
    province: null,
    record_date: null,
    location: null,
    split_times: null,
    sort_order: 0,
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("PublicRecordSearch stroke headers", () => {
  it("renders canonical stroke headers for an individual list", () => {
    render(
      <PublicRecordSearch
        records={[
          rec({ id: "a", event_name: "100 Back", swimmer_name: "Ann Back" }),
          rec({ id: "b", event_name: "50 Free", swimmer_name: "Fred Free" }),
        ]}
        recordType="individual"
        scope="club"
      />
    );
    // Headers render in both the desktop table and the mobile card list,
    // so each label appears at least once.
    expect(screen.getAllByText("Freestyle").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Backstroke").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Fred Free").length).toBeGreaterThan(0);
  });

  it("does not render stroke headers for a relay list", () => {
    render(
      <PublicRecordSearch
        records={[rec({ id: "rel", event_name: "4x50 Free", age_group: "72-99" })]}
        recordType="relay"
        scope="club"
      />
    );
    expect(screen.queryByText("Freestyle")).toBeNull();
  });
});

describe("PublicRecordSearch splits", () => {
  it("expands to show split cumulative + delta", async () => {
    const user = userEvent.setup();
    render(
      <PublicRecordSearch
        records={[
          rec({
            id: "s1",
            event_name: "100 Free",
            swimmer_name: "Jane Doe",
            split_times: [
              { distance: 50, ms: 29100 },
              { distance: 100, ms: 62780 },
            ],
          }),
        ]}
        recordType="individual"
        scope="club"
      />
    );
    // Expander present because the record has splits (desktop + mobile = 2)
    const toggles = screen.getAllByTitle("Show splits / previous records");
    expect(toggles.length).toBeGreaterThan(0);
    await user.click(toggles[0]);
    expect(screen.getAllByText("Splits").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50m").length).toBeGreaterThan(0);
    // delta for the 2nd split: 62780-29100 = 33680ms -> "33.68"
    expect(screen.getAllByText("(+33.68)").length).toBeGreaterThan(0);
  });

  it("shows no expander when a record has neither history nor splits", () => {
    render(
      <PublicRecordSearch
        records={[rec({ id: "plain", event_name: "50 Free", swimmer_name: "No Splits" })]}
        recordType="individual"
        scope="club"
      />
    );
    expect(screen.queryByTitle("Show splits / previous records")).toBeNull();
  });
});
