"use client";

import { useState } from "react";
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

  const filteredRecords = records.filter((record) => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    return (
      record.event_name.toLowerCase().includes(searchLower) ||
      record.swimmer_name.toLowerCase().includes(searchLower) ||
      record.location?.toLowerCase().includes(searchLower)
    );
  });

  // Check if any records have flags
  const hasAnyFlags = records.some(
    (r) => r.is_national || r.is_provincial || r.is_split || r.is_relay_split || r.is_new
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
              {filteredRecords.map((record) => (
                <tr key={record.id}>
                  <td className="px-4 py-3 text-gray-900 dark:text-white">
                    {record.event_name}
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
                    {record.record_date
                      ? new Date(record.record_date).toLocaleDateString()
                      : "-"}
                  </td>
                  <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 lg:table-cell">
                    {record.location || "-"}
                  </td>
                </tr>
              ))}
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
        {filteredRecords.map((record) => (
          <div
            key={`mobile-${record.id}`}
            className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-900 dark:text-white">
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
                {record.record_date &&
                  new Date(record.record_date).toLocaleDateString()}
                {record.record_date && record.location && " • "}
                {record.location}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
