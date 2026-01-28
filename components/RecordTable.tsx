"use client";

import React, { useState, useRef, useEffect } from "react";
import { formatMsToTime, parseTimeToMs, isValidTimeFormat } from "@/lib/time-utils";
import type { SwimRecord } from "@/types/database";
import RecordFlags from "./RecordFlags";

interface EditableRecord extends Omit<SwimRecord, "id" | "created_at" | "record_list_id"> {
  id?: string;
  isNew?: boolean;
  _breakingRecordId?: string; // ID of the record this new record is breaking
}

export type RecordFlagType = "is_national" | "is_current_national" | "is_provincial" | "is_current_provincial" | "is_split" | "is_relay_split" | "is_new" | "is_world_record";

interface RecordTableProps {
  records: SwimRecord[];
  onSave: (records: EditableRecord[]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBreakRecord?: (oldRecordId: string, newRecordId: string) => Promise<void>;
  readOnly?: boolean;
}

const STANDARD_EVENTS = [
  "50 Free", "100 Free", "200 Free", "400 Free", "800 Free", "1500 Free",
  "50 Back", "100 Back", "200 Back",
  "50 Breast", "100 Breast", "200 Breast",
  "50 Fly", "100 Fly", "200 Fly",
  "200 IM", "400 IM",
];

export default function RecordTable({ records, onSave, onDelete, onBreakRecord, readOnly = false }: RecordTableProps) {
  // Separate current and history records
  const currentRecords = records.filter((r) => r.is_current !== false);
  const historyRecords = records.filter((r) => r.is_current === false);

  // Build a map of record ID -> history records (records where superseded_by = this ID)
  const historyByRecordId = new Map<string, SwimRecord[]>();
  historyRecords.forEach((hr) => {
    if (hr.superseded_by) {
      const existing = historyByRecordId.get(hr.superseded_by) || [];
      existing.push(hr);
      historyByRecordId.set(hr.superseded_by, existing);
    }
  });

  // Sort history by record_date descending (most recent first)
  historyByRecordId.forEach((records, key) => {
    records.sort((a, b) => {
      if (!a.record_date && !b.record_date) return 0;
      if (!a.record_date) return 1;
      if (!b.record_date) return -1;
      return b.record_date.localeCompare(a.record_date);
    });
    historyByRecordId.set(key, records);
  });

  const mapRecordToEditable = (r: SwimRecord): EditableRecord => ({
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
    is_world_record: r.is_world_record || false,
    superseded_by: r.superseded_by,
    is_current: r.is_current ?? true,
  });

  const [editableRecords, setEditableRecords] = useState<EditableRecord[]>(
    currentRecords.map(mapRecordToEditable)
  );
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ index: number; field: string } | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [flagMenuOpen, setFlagMenuOpen] = useState<number | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const flagMenuRef = useRef<HTMLDivElement>(null);

  // Sync editableRecords when records prop changes (e.g., after save)
  useEffect(() => {
    const newCurrentRecords = records.filter((r) => r.is_current !== false);
    setEditableRecords(newCurrentRecords.map(mapRecordToEditable));
    setHasChanges(false);
  }, [records]);

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
      is_world_record: false,
      superseded_by: null,
      is_current: true,
      isNew: true,
    };
    setEditableRecords([...editableRecords, newRecord]);
    setHasChanges(true);
  };

  const breakRecord = (index: number) => {
    const oldRecord = editableRecords[index];
    if (!oldRecord.id) return; // Can't break a new record

    // Create a new record that will supersede the old one
    const newRecord: EditableRecord = {
      event_name: oldRecord.event_name,
      time_ms: 0,
      swimmer_name: "",
      record_date: null,
      location: null,
      sort_order: oldRecord.sort_order,
      is_national: false,
      is_current_national: false,
      is_provincial: false,
      is_current_provincial: false,
      is_split: false,
      is_relay_split: false,
      is_new: true, // Mark as new record
      is_world_record: false,
      superseded_by: null,
      is_current: true,
      isNew: true,
      _breakingRecordId: oldRecord.id, // Track which record this breaks
    };

    // Insert after the current record
    const newRecords = [...editableRecords];
    newRecords.splice(index + 1, 0, newRecord);

    setEditableRecords(newRecords);
    setHasChanges(true);
  };

  const toggleHistoryExpanded = (recordId: string) => {
    const newExpanded = new Set(expandedHistory);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedHistory(newExpanded);
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
      is_world_record: false,
      superseded_by: null,
      is_current: true,
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
      {!readOnly && (
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
      )}

      <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {!readOnly && (
                <th className="w-10 px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  #
                </th>
              )}
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
              {!readOnly && (
                <th className="w-24 px-3 py-2 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {editableRecords.map((record, index) => {
              const hasHistory = record.id ? (historyByRecordId.get(record.id)?.length ?? 0) > 0 : false;
              const isExpanded = record.id ? expandedHistory.has(record.id) : false;
              const historyForRecord = record.id ? historyByRecordId.get(record.id) || [] : [];
              const isBreakingRecord = !!record._breakingRecordId;

              return (
                <React.Fragment key={record.id || `new-${index}`}>
                  <tr
                    className={`border-t border-gray-200 dark:border-gray-700 ${
                      isBreakingRecord ? "bg-green-50 dark:bg-green-900/20" : ""
                    }`}
                  >
                    {!readOnly && (
                      <td className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                        <div className="flex items-center gap-1">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={() => record.id && toggleHistoryExpanded(record.id)}
                              className="mr-1 text-gray-400 hover:text-gray-600"
                              title={isExpanded ? "Hide history" : "Show history"}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
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
                    )}
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <div className="flex items-center gap-2">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={() => record.id && toggleHistoryExpanded(record.id)}
                              className="text-gray-400 hover:text-gray-600"
                              title={isExpanded ? "Hide history" : "Show history"}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                          <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.event_name}</span>
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={record.event_name}
                          onChange={(e) => handleCellChange(index, "event_name", e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                          placeholder="Event name"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">
                          {record.time_ms > 0 ? formatMsToTime(record.time_ms) : ""}
                        </span>
                      ) : (
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
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.swimmer_name}</span>
                      ) : (
                        <input
                          type="text"
                          value={record.swimmer_name}
                          onChange={(e) => handleCellChange(index, "swimmer_name", e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                          placeholder="Swimmer name"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.record_date || ""}</span>
                      ) : (
                        <input
                          type="date"
                          value={record.record_date || ""}
                          onChange={(e) => handleCellChange(index, "record_date", e.target.value)}
                          className="rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {readOnly ? (
                        <span className="px-2 py-1 text-sm text-gray-900 dark:text-white">{record.location || ""}</span>
                      ) : (
                        <input
                          type="text"
                          value={record.location || ""}
                          onChange={(e) => handleCellChange(index, "location", e.target.value)}
                          className="w-full rounded border border-transparent bg-transparent px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:text-white"
                          placeholder="Location"
                        />
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="relative flex items-center gap-1">
                        <RecordFlags record={record} size="sm" />
                        {!readOnly && (
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
                                  { key: "is_world_record" as RecordFlagType, label: "World Record", icon: "👑" },
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
                        )}
                      </div>
                    </td>
                    {!readOnly && (
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {record.id && !record.isNew && (
                            <button
                              type="button"
                              onClick={() => breakRecord(index)}
                              className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                              title="Add new record that breaks this one"
                            >
                              Break
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeRow(index)}
                            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Remove
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* History rows */}
                  {isExpanded && historyForRecord.map((historyRecord) => (
                    <tr
                      key={historyRecord.id}
                      className="border-t border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-800/30"
                    >
                      {!readOnly && (
                        <td className="px-3 py-2 text-sm text-gray-400">
                          <span className="ml-4 text-xs">↳</span>
                        </td>
                      )}
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                          {readOnly && <span className="ml-6"></span>}
                          {historyRecord.event_name}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                          {historyRecord.time_ms > 0 ? formatMsToTime(historyRecord.time_ms) : ""}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                          {historyRecord.swimmer_name}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                          {historyRecord.record_date || ""}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">
                          {historyRecord.location || ""}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <RecordFlags record={historyRecord} size="sm" />
                      </td>
                      {!readOnly && (
                        <td className="px-3 py-2">
                          <span className="text-xs text-gray-400">Previous</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
            {editableRecords.length === 0 && (
              <tr>
                <td
                  colSpan={readOnly ? 7 : 8}
                  className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {readOnly ? "No records yet." : "No records yet. Add a row or import from CSV."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
