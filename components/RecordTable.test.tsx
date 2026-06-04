// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SwimRecord } from "@/types/database";
import RecordTable from "./RecordTable";

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RecordTable", () => {
  it("renders a record's event and swimmer values", () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getByDisplayValue("50 Free")).toBeInTheDocument();
    expect(screen.getByDisplayValue("John Smith")).toBeInTheDocument();
  });

  it("formats a record's time via time-utils", () => {
    render(<RecordTable records={[rec({ time_ms: 24560 })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getByDisplayValue("24.56")).toBeInTheDocument();
  });

  it("excludes empty-event rows from the onSave payload", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<RecordTable records={[rec({ id: "r1", event_name: "50 Free" })]} onSave={onSave} onDelete={vi.fn()} courseType="SCM" />);

    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    await userEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload).toHaveLength(1);
    expect(payload[0].event_name).toBe("50 Free");
  });

  it("adds an editable row on '+ Add Row'", async () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    expect(screen.getAllByPlaceholderText("Event name")).toHaveLength(1);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    expect(screen.getAllByPlaceholderText("Event name")).toHaveLength(2);
  });

  it("calls onDelete for a persisted row's Remove", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<RecordTable records={[rec({ id: "r1" })]} onSave={vi.fn()} onDelete={onDelete} courseType="SCM" />);
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).toHaveBeenCalledWith("r1");
  });

  it("does not call onDelete when removing a brand-new unsaved row", async () => {
    const onDelete = vi.fn();
    render(<RecordTable records={[]} onSave={vi.fn()} onDelete={onDelete} courseType="SCM" />);
    await userEvent.click(screen.getByRole("button", { name: "+ Add Row" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("parses a typed time on blur", async () => {
    render(<RecordTable records={[rec({ time_ms: 0 })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" />);
    const timeInput = screen.getByPlaceholderText("0:00.00");
    await userEvent.click(timeInput);
    await userEvent.clear(timeInput);
    await userEvent.type(timeInput, "1:02.50");
    await userEvent.tab();
    expect(timeInput).toHaveValue("1:02.50");
  });

  it("hides editing controls in readOnly mode", () => {
    render(<RecordTable records={[rec()]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" readOnly />);
    expect(screen.queryByRole("button", { name: "Save Changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add Row" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  it("renders 4 swimmer inputs for a relay list", () => {
    render(
      <RecordTable
        records={[rec({ swimmer_name: "A", swimmer_name_2: "B", swimmer_name_3: "C", swimmer_name_4: "D", age_group: "13-14", event_name: "4x50 Free" })]}
        onSave={vi.fn()}
        onDelete={vi.fn()}
        courseType="SCM"
        recordType="relay"
        ageGroups={["13-14"]}
        relayEvents={["4x50 Free"]}
      />
    );
    expect(screen.getByPlaceholderText("Swimmer 1")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Swimmer 4")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Swimmer name")).not.toBeInTheDocument();
  });

  it("renders a province input for national scope", () => {
    render(<RecordTable records={[rec({ province: "ON" })]} onSave={vi.fn()} onDelete={vi.fn()} courseType="SCM" scope="national" />);
    expect(screen.getByPlaceholderText("Prov")).toBeInTheDocument();
  });
});
