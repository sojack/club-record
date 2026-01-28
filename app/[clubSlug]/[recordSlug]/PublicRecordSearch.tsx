"use client";

import React, { useState } from "react";
import type { SwimRecord } from "@/types/database";
import { formatMsToTime } from "@/lib/time-utils";
import RecordFlags, { RecordFlagsLegend } from "@/components/RecordFlags";

interface PublicRecordSearchProps {
  records: SwimRecord[];
}

export default function PublicRecordSearch({
  records,
}: PublicRecordSearchProps) {
  const formatTime = formatMsToTime;
  const [search, setSearch] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  // Separate current and history records
  const currentRecords = records.filter((r) => r.is_current !== false);
  const historyRecords = records.filter((r) => r.is_current === false);

  // Build a map of record ID -> history records
  const historyByRecordId = new Map<string, SwimRecord[]>();
  historyRecords.forEach((hr) => {
    if (hr.superseded_by) {
      const existing = historyByRecordId.get(hr.superseded_by) || [];
      existing.push(hr);
      historyByRecordId.set(hr.superseded_by, existing);
    }
  });

  // Sort history by record_date descending
  historyByRecordId.forEach((recs, key) => {
    recs.sort((a, b) => {
      if (!a.record_date && !b.record_date) return 0;
      if (!a.record_date) return 1;
      if (!b.record_date) return -1;
      return b.record_date.localeCompare(a.record_date);
    });
    historyByRecordId.set(key, recs);
  });

  const toggleHistory = (recordId: string) => {
    const newExpanded = new Set(expandedHistory);
    if (newExpanded.has(recordId)) {
      newExpanded.delete(recordId);
    } else {
      newExpanded.add(recordId);
    }
    setExpandedHistory(newExpanded);
  };

  // Format partial dates: "2024" -> "2024", "2024-03" -> "Mar 2024", "2024-03-15" -> "Mar 15, 2024"
  const formatDate = (dateStr: string | null): string => {
    if (!dateStr) return "-";

    // Year only
    if (/^\d{4}$/.test(dateStr)) {
      return dateStr;
    }

    // Year and month
    if (/^\d{4}-\d{2}$/.test(dateStr)) {
      const [year, month] = dateStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1);
      return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
    }

    // Full date
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    }

    // Fallback
    return dateStr;
  };

  const filteredRecords = currentRecords.filter((record) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    return (
      record.event_name.toLowerCase().includes(searchLower) ||
      record.swimmer_name.toLowerCase().includes(searchLower) ||
      record.location?.toLowerCase().includes(searchLower)
    );
  });

  // Check if any records have flags
  const hasAnyFlags = currentRecords.some(
    (r) => r.is_national || r.is_current_national || r.is_provincial || r.is_current_provincial || r.is_split || r.is_relay_split || r.is_new || r.is_world_record
  );

  return (
    <>
      <div className="mb-6 space-y-3">
        <input
          type="text"
          placeholder="Search by event, swimmer, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        {hasAnyFlags && <RecordFlagsLegend />}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Event
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Swimmer
                </th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 md:table-cell">
                  Date
                </th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 lg:table-cell">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredRecords.map((record) => {
                const hasHistory = historyByRecordId.has(record.id);
                const isExpanded = expandedHistory.has(record.id);
                const history = historyByRecordId.get(record.id) || [];

                return (
                  <React.Fragment key={record.id}>
                    <tr>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        <span className="flex items-center gap-2">
                          {hasHistory && (
                            <button
                              type="button"
                              onClick={() => toggleHistory(record.id)}
                              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                              title={isExpanded ? "Hide history" : "Show previous records"}
                            >
                              {isExpanded ? "▼" : "▶"}
                            </button>
                          )}
                          {record.event_name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        <span className="flex items-center gap-1">
                          <span className="font-mono">
                            {record.time_ms > 0 ? formatTime(record.time_ms) : "-"}
                          </span>
                          <RecordFlags record={record} size="sm" />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">
                        {record.swimmer_name || "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 md:table-cell">
                        {formatDate(record.record_date)}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 lg:table-cell">
                        {record.location || "-"}
                      </td>
                    </tr>
                    {isExpanded && history.map((historyRecord) => (
                      <tr
                        key={historyRecord.id}
                        className="bg-gray-50/50 dark:bg-gray-800/50"
                      >
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                          <span className="ml-6 text-sm">↳ {historyRecord.event_name}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <span className="font-mono text-sm">
                              {historyRecord.time_ms > 0 ? formatTime(historyRecord.time_ms) : "-"}
                            </span>
                            <RecordFlags record={historyRecord} size="sm" />
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                          {historyRecord.swimmer_name || "-"}
                        </td>
                        <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 md:table-cell">
                          {formatDate(historyRecord.record_date)}
                        </td>
                        <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 lg:table-cell">
                          {historyRecord.location || "-"}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {filteredRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-gray-500 dark:text-gray-400"
                  >
                    {search
                      ? "No records match your search."
                      : "No records available."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card view for smaller screens */}
      <div className="mt-6 space-y-3 md:hidden">
        {filteredRecords.map((record) => {
          const hasHistory = historyByRecordId.has(record.id);
          const isExpanded = expandedHistory.has(record.id);
          const history = historyByRecordId.get(record.id) || [];

          return (
            <div key={`mobile-${record.id}`}>
              <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    {hasHistory && (
                      <button
                        type="button"
                        onClick={() => toggleHistory(record.id)}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {isExpanded ? "▼" : "▶"}
                      </button>
                    )}
                    {record.event_name}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      {record.time_ms > 0 ? formatTime(record.time_ms) : "-"}
                    </span>
                    <RecordFlags record={record} size="sm" />
                  </span>
                </div>
                <div className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  {record.swimmer_name}
                </div>
                {(record.record_date || record.location) && (
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                    {record.record_date && formatDate(record.record_date)}
                    {record.record_date && record.location && " • "}
                    {record.location}
                  </div>
                )}
              </div>
              {isExpanded && history.map((historyRecord) => (
                <div
                  key={`mobile-history-${historyRecord.id}`}
                  className="ml-4 mt-1 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ↳ {historyRecord.event_name}
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="font-mono text-sm text-gray-500 dark:text-gray-400">
                        {historyRecord.time_ms > 0 ? formatTime(historyRecord.time_ms) : "-"}
                      </span>
                      <RecordFlags record={historyRecord} size="sm" />
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {historyRecord.swimmer_name}
                  </div>
                  {(historyRecord.record_date || historyRecord.location) && (
                    <div className="mt-1 text-xs text-gray-400">
                      {historyRecord.record_date && formatDate(historyRecord.record_date)}
                      {historyRecord.record_date && historyRecord.location && " • "}
                      {historyRecord.location}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
