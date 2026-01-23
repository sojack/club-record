"use client";

import { useState, useRef, useEffect } from "react";
import { formatMsToTime, parseTimeToMs, isValidTimeFormat } from "@/lib/time-utils";
import type { SwimRecord } from "@/types/database";
import RecordFlags from "./RecordFlags";

interface EditableRecord extends Omit<SwimRecord, "id" | "created_at" | "record_list_id"> {
  id?: string;
  isNew?: boolean;
}

export type RecordFlagType = "is_national" | "is_current_national" | "is_provincial" | "is_current_provincial" | "is_split" | "is_relay_split" | "is_new";

interface RecordTableProps {
  records: SwimRecord[];
  onSave: (records: EditableRecord[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const STANDARD_EVENTS = [
  "50 Free", "100 Free", "200 Free", "400 Free", "800 Free", "1500 Free",
  "50 Back", "100 Back", "200 Back",
  "50 Breast", "100 Breast", "200 Breast",
  "50 Fly", "100 Fly", "200 Fly",
  "200 IM", "400 IM",
];

export default function RecordTable({ records, onSave, onDelete }: RecordTableProps) {
  const [editableRecords, setEditableRecords] = useState<EditableRecord[]>(
    records.map((r) => ({
      id: r.id,
      event_name: r.event_name,
      time_ms: r.time_ms,
      swimmer_name: r.swimmer_name,
      record_date: r.record_date,
      location: r.location,
      sort_order: r.sort_order,
      is_national: r.is_national || false,
      is_current_national: r.is_current_national || false,
      is_provincial: r.is_provincial || false,
      is_current_provincial: r.is_current_provincial || false,
      is_split: r.is_split || false,
      is_relay_split: r.is_relay_split || false,
      is_new: r.is_new || false,
    }))
  );
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ index: number; field: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [flagMenuOpen, setFlagMenuOpen] = useState<number | null>(null);
  const flagMenuRef = useRef<HTMLDivElement>(null);

  // Close flag menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (flagMenuRef.current && !flagMenuRef.current.contains(event.target as Node)) {
        setFlagMenuOpen(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleFlag = (index: number, flag: RecordFlagType) => {
    const newRecords = [...editableRecords];
    newRecords[index][flag] = !newRecords[index][flag];
    setEditableRecords(newRecords);
    setHasChanges(true);
  };

  const handleCellChange = (index: number, field: keyof EditableRecord, value: string) => {
    const newRecords = [...editableRecords];
    const record = newRecords[index];

    if (field === "time_ms") {
      // Store the raw time string for editing, convert on blur
      (record as unknown as { [K in keyof EditableRecord]: unknown })[field] = value;
    } else {
      (record as unknown as { [K in keyof EditableRecord]: unknown })[field] = value;
    }

    setEditableRecords(newRecords);
    setHasChanges(true);
  };

  const handleTimeBlur = (index: number, value: string) => {
    const newRecords = [...editableRecords];
    if (isValidTimeFormat(value)) {
      newRecords[index].time_ms = parseTimeToMs(value);
    } else if (typeof value === "string" && value.trim() !== "") {
      // Try to parse it anyway
      const parsed = parseTimeToMs(value);
      if (parsed > 0) {
        newRecords[index].time_ms = parsed;
      }
    }
    setEditableRecords(newRecords);
    setEditingCell(null);
  };

  const addRow = () => {
    const newRecord: EditableRecord = {
      event_name: "",
      time_ms: 0,
      swimmer_name: "",
      record_date: null,
      location: null,
      sort_order: editableRecords.length,
      is_national: false,
      is_current_national: false,
      is_provincial: false,
      is_current_provincial: false,
      is_split: false,
      is_relay_split: false,
      is_new: false,
      isNew: true,
    };
    setEditableRecords([...editableRecords, newRecord]);
    setHasChanges(true);
  };

  const removeRow = async (index: number) => {
    const record = editableRecords[index];
    if (record.id && !record.isNew) {
      await onDelete(record.id);
    }
    const newRecords = editableRecords.filter((_, i) => i !== index);
    setEditableRecords(newRecords);
    setHasChanges(true);
  };

  const addStandardEvents = () => {
    const existingEvents = new Set(editableRecords.map((r) => r.event_name.toLowerCase()));
    const newEvents = STANDARD_EVENTS.filter(
      (event) => !existingEvents.has(event.toLowerCase())
    );

    const newRecords: EditableRecord[] = newEvents.map((event, i) => ({
      event_name: event,
      time_ms: 0,
      swimmer_name: "",
      record_date: null,
      location: null,
      sort_order: editableRecords.length + i,
      is_national: false,
      is_current_national: false,
      is_provincial: false,
      is_current_provincial: false,
      is_split: false,
      is_relay_split: false,
      is_new: false,
      isNew: true,
    }));

    setEditableRecords([...editableRecords, ...newRecords]);
    setHasChanges(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Filter out empty rows
      const validRecords = editableRecords.filter(
        (r) => r.event_name.trim() !== ""
      );
      await onSave(validRecords);
      setHasChanges(false);
    } finally {
      setSaving(false);
    }
  };

  const moveRow = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === editableRecords.length - 1)
    ) {
      return;
    }

    const newRecords = [...editableRecords];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    [newRecords[index], newRecords[targetIndex]] = [
      newRecords[targetIndex],
      newRecords[index],
    ];

    // Update sort orders
    newRecords.forEach((r, i) => {
      r.sort_order = i;
    });

    setEditableRecords(newRecords);
    setHasChanges(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Add Row
        </button>
        <button
          type="button"
          onClick={addStandardEvents}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          + Standard Events
        </button>
        {hasChanges && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="ml-auto rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th className="w-10 px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                #
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Event
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Time
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Swimmer
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Date
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Location
              </th>
              <th className="px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Flags
              </th>
              <th className="w-24 px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {editableRecords.map((record, index) => (
              <tr
                key={record.id || `new-${index}`}
                className="border-t border-gray-200 dark:border-gray-700"
              >
                <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => moveRow(index, "up")}
                      disabled={index === 0}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => moveRow(index, "down")}
                      disabled={index === editableRecords.length - 1}
                      className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={record.event_name}
                    onChange={(e) => handleCellChange(index, "event_name", e.target.value)}
                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                    placeholder="Event name"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={
                      editingCell?.index === index && editingCell?.field === "time_ms"
                        ? String(record.time_ms)
                        : record.time_ms > 0
                        ? formatMsToTime(record.time_ms)
                        : ""
                    }
                    onChange={(e) => handleCellChange(index, "time_ms", e.target.value)}
                    onFocus={() => setEditingCell({ index, field: "time_ms" })}
                    onBlur={(e) => handleTimeBlur(index, e.target.value)}
                    className="w-24 rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                    placeholder="0:00.00"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={record.swimmer_name}
                    onChange={(e) => handleCellChange(index, "swimmer_name", e.target.value)}
                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                    placeholder="Swimmer name"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="date"
                    value={record.record_date || ""}
                    onChange={(e) => handleCellChange(index, "record_date", e.target.value)}
                    className="rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    value={record.location || ""}
                    onChange={(e) => handleCellChange(index, "location", e.target.value)}
                    className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                    placeholder="Location"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="relative flex items-center gap-1">
                    <RecordFlags record={record} size="sm" />
                    <div ref={flagMenuOpen === index ? flagMenuRef : null}>
                      <button
                        type="button"
                        onClick={() => setFlagMenuOpen(flagMenuOpen === index ? null : index)}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                        title="Edit flags"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                      {flagMenuOpen === index && (
                        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-700">
                          {[
                            { key: "is_national" as RecordFlagType, label: "Canadian Record", icon: "🍁" },
                            { key: "is_current_national" as RecordFlagType, label: "Current National", icon: "🇨🇦" },
                            { key: "is_provincial" as RecordFlagType, label: "Provincial Record", icon: "🏅" },
                            { key: "is_current_provincial" as RecordFlagType, label: "Current Provincial", icon: "🥇" },
                            { key: "is_split" as RecordFlagType, label: "Split Time", icon: "⏱️" },
                            { key: "is_relay_split" as RecordFlagType, label: "Relay Split", icon: "🏊" },
                            { key: "is_new" as RecordFlagType, label: "New Record", icon: "⭐" },
                          ].map((flag) => (
                            <button
                              key={flag.key}
                              type="button"
                              onClick={() => toggleFlag(index, flag.key)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-600"
                            >
                              <span>{flag.icon}</span>
                              <span className="flex-1 text-gray-700 dark:text-gray-200">{flag.label}</span>
                              {record[flag.key] && (
                                <svg className="h-4 w-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {editableRecords.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  No records yet. Add a row or import from CSV.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
