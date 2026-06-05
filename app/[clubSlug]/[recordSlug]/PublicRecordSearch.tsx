"use client";

import React, { useState } from "react";
import type { SwimRecord } from "@/types/database";
import { formatMsToTime } from "@/lib/time-utils";
import RecordFlags, { RecordFlagsLegend } from "@/components/RecordFlags";
import { splitRows } from "@/lib/split-utils";
import { buildStrokeSections } from "@/lib/stroke-grouping";

interface PublicRecordSearchProps {
  records: SwimRecord[];
  recordType?: "individual" | "relay";
  scope?: "club" | "provincial" | "national";
}

export default function PublicRecordSearch({
  records,
  recordType = "individual",
  scope = "club",
}: PublicRecordSearchProps) {
  const isRelay = recordType === "relay";
  const showHolderClub = scope !== "club";
  const showProvince = scope === "national";
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
      const [year, month, day] = dateStr.split("-");
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
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
      record.swimmer_name_2?.toLowerCase().includes(searchLower) ||
      record.swimmer_name_3?.toLowerCase().includes(searchLower) ||
      record.swimmer_name_4?.toLowerCase().includes(searchLower) ||
      record.record_club?.toLowerCase().includes(searchLower) ||
      record.location?.toLowerCase().includes(searchLower)
    );
  });

  // Individual lists group under stroke headers; relays keep the flat layout.
  const strokeGrouped = recordType === "individual";
  // National/provincial individual lists also have age-band headers.
  const hasBands =
    strokeGrouped &&
    currentRecords.some((r) => r.age_group && r.age_group.trim() !== "");
  const sections = buildStrokeSections(filteredRecords, hasBands);

  const desktopColSpan = 5 + (isRelay ? 1 : 0) + (showHolderClub ? 1 : 0) + (showProvince ? 1 : 0);

  const renderDesktopRecord = (record: SwimRecord) => {
    const hasHistory = historyByRecordId.has(record.id);
    const isExpanded = expandedHistory.has(record.id);
    const history = historyByRecordId.get(record.id) || [];
    const hasSplits = (record.split_times?.length ?? 0) > 0;
    return (
      <React.Fragment key={record.id}>
        <tr>
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            <span className="flex items-center gap-2">
              {(hasHistory || hasSplits) && (
                <button
                  type="button"
                  onClick={() => toggleHistory(record.id)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title={isExpanded ? "Hide details" : "Show splits / previous records"}
                >
                  {isExpanded ? "▼" : "▶"}
                </button>
              )}
              {record.event_name}
            </span>
          </td>
          {isRelay && (
            <td className="px-4 py-3 text-gray-900 dark:text-white">
              {record.age_group || "-"}
            </td>
          )}
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            <span className="flex items-center gap-1">
              <span className="font-mono">
                {record.time_ms > 0 ? formatTime(record.time_ms) : "-"}
              </span>
              <RecordFlags record={record} size="sm" />
            </span>
          </td>
          <td className="px-4 py-3 text-gray-900 dark:text-white">
            {isRelay
              ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4]
                  .filter((n) => n && n.trim())
                  .map((n, i) => <div key={i}>{n}</div>)
              : record.swimmer_name || "-"}
          </td>
          {showHolderClub && (
            <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 sm:table-cell">
              {record.record_club || "-"}
            </td>
          )}
          {showProvince && (
            <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 sm:table-cell">
              {record.province || "-"}
            </td>
          )}
          <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 md:table-cell">
            {formatDate(record.record_date)}
          </td>
          <td className="hidden px-4 py-3 text-gray-500 dark:text-gray-400 lg:table-cell">
            {record.location || "-"}
          </td>
        </tr>
        {isExpanded && hasSplits && (
          <tr className="bg-blue-50/40 dark:bg-blue-900/10">
            <td colSpan={desktopColSpan} className="px-4 py-2">
              <div className="ml-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="font-medium text-gray-500 dark:text-gray-400">Splits</span>
                {splitRows(record.split_times!).map((s, i) => (
                  <span key={s.distance} className="text-gray-700 dark:text-gray-300">
                    <span className="text-gray-400">{s.distance}m</span>{" "}
                    <span className="font-mono">{formatTime(s.cumulativeMs)}</span>
                    {i > 0 && (
                      <span className="ml-1 font-mono text-gray-400">
                        (+{formatTime(s.deltaMs)})
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </td>
          </tr>
        )}
        {isExpanded && history.map((historyRecord) => (
          <tr
            key={historyRecord.id}
            className="bg-gray-50/50 dark:bg-gray-800/50"
          >
            <td className="px-4 py-2 text-gray-500 dark:text-gray-400">
              <span className="ml-6 text-sm">↳ {historyRecord.event_name}</span>
            </td>
            {isRelay && (
              <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
                {historyRecord.age_group || "-"}
              </td>
            )}
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
            {showHolderClub && (
              <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 sm:table-cell">
                {historyRecord.record_club || "-"}
              </td>
            )}
            {showProvince && (
              <td className="hidden px-4 py-2 text-sm text-gray-500 dark:text-gray-400 sm:table-cell">
                {historyRecord.province || "-"}
              </td>
            )}
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
  };

  const renderMobileCard = (record: SwimRecord) => {
    const hasHistory = historyByRecordId.has(record.id);
    const isExpanded = expandedHistory.has(record.id);
    const history = historyByRecordId.get(record.id) || [];
    const hasSplits = (record.split_times?.length ?? 0) > 0;
    return (
      <div key={`mobile-${record.id}`}>
        <div className="rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
              {(hasHistory || hasSplits) && (
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
            {isRelay
              ? [record.swimmer_name, record.swimmer_name_2, record.swimmer_name_3, record.swimmer_name_4]
                  .filter((n) => n && n.trim())
                  .join(", ")
              : record.swimmer_name}
          </div>
          {isRelay && (record.age_group || showHolderClub) && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              {record.age_group}
              {showHolderClub && (record.record_club || (showProvince && record.province)) && " • "}
              {showHolderClub && [record.record_club, showProvince ? record.province : null].filter(Boolean).join(", ")}
            </div>
          )}
          {(record.record_date || record.location) && (
            <div className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              {record.record_date && formatDate(record.record_date)}
              {record.record_date && record.location && " • "}
              {record.location}
            </div>
          )}
        </div>
        {isExpanded && hasSplits && (
          <div className="ml-4 mt-1 rounded-lg bg-blue-50/40 p-3 dark:bg-blue-900/10">
            <div className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">Splits</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {splitRows(record.split_times!).map((s, i) => (
                <span key={s.distance} className="text-gray-700 dark:text-gray-300">
                  <span className="text-gray-400">{s.distance}m</span>{" "}
                  <span className="font-mono">{formatTime(s.cumulativeMs)}</span>
                  {i > 0 && (
                    <span className="ml-1 font-mono text-gray-400">(+{formatTime(s.deltaMs)})</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
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
  };

  // Check if any records have flags
  const hasAnyFlags = currentRecords.some(
    (r) => r.is_national || r.is_current_national || r.is_provincial || r.is_current_provincial || r.is_split || r.is_relay_split || r.is_new || r.is_world_record
  );

  return (
    <>
      <div className="mb-6 space-y-3">
        <input
          type="text"
          placeholder="Search by event, swimmer, club, or location..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        />
        {hasAnyFlags && <RecordFlagsLegend records={currentRecords} />}
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm dark:bg-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Event
                </th>
                {isRelay && (
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                    Age Group
                  </th>
                )}
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  Time
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isRelay ? "Swimmers" : "Swimmer"}
                </th>
                {showHolderClub && (
                  <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 sm:table-cell">
                    Club
                  </th>
                )}
                {showProvince && (
                  <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 sm:table-cell">
                    Prov
                  </th>
                )}
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 md:table-cell">
                  Date
                </th>
                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-700 dark:text-gray-300 lg:table-cell">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {strokeGrouped
                ? sections.map((section) => (
                    <React.Fragment
                      key={`section-${section.band ?? "all"}`}
                    >
                      {section.band !== null && (
                        <tr className="bg-gray-800 dark:bg-gray-900">
                          <td
                            colSpan={desktopColSpan}
                            className="px-4 py-3 text-lg font-bold tracking-wide text-white dark:text-gray-100"
                          >
                            {section.band}
                          </td>
                        </tr>
                      )}
                      {section.strokeGroups.map((g) => (
                        <React.Fragment
                          key={`stroke-${section.band ?? "all"}-${g.stroke.key}`}
                        >
                          <tr className="bg-gray-100 dark:bg-gray-700/50">
                            <td
                              colSpan={desktopColSpan}
                              className={`${
                                section.band !== null ? "pl-8" : "pl-4"
                              } pr-4 py-2 font-semibold text-gray-700 dark:text-gray-200`}
                            >
                              {g.stroke.label}
                            </td>
                          </tr>
                          {g.records.map((record) =>
                            renderDesktopRecord(record)
                          )}
                        </React.Fragment>
                      ))}
                    </React.Fragment>
                  ))
                : filteredRecords.map((record) => renderDesktopRecord(record))}
              {filteredRecords.length === 0 && (
                <tr>
                  <td
                    colSpan={desktopColSpan}
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
        {strokeGrouped
          ? sections.map((section) => (
              <div
                key={`msection-${section.band ?? "all"}`}
                className="space-y-3"
              >
                {section.band !== null && (
                  <div className="rounded-md bg-gray-800 px-3 py-2 text-lg font-bold tracking-wide text-white dark:bg-gray-900 dark:text-gray-100">
                    {section.band}
                  </div>
                )}
                {section.strokeGroups.map((g) => (
                  <div
                    key={`mstroke-${section.band ?? "all"}-${g.stroke.key}`}
                    className="space-y-3"
                  >
                    <div
                      className={`rounded-md bg-gray-100 px-3 py-2 font-semibold text-gray-700 dark:bg-gray-700/50 dark:text-gray-200 ${
                        section.band !== null ? "ml-4" : ""
                      }`}
                    >
                      {g.stroke.label}
                    </div>
                    {g.records.map((record) => renderMobileCard(record))}
                  </div>
                ))}
              </div>
            ))
          : filteredRecords.map((record) => renderMobileCard(record))}
      </div>
    </>
  );
}
