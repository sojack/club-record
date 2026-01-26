"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import { formatMsToTime } from "@/lib/time-utils";
import type { RecordList, SwimRecord } from "@/types/database";

export default function RecordListsPage() {
  const { selectedClub, isLoading: clubLoading, canEdit } = useClub();
  const [recordLists, setRecordLists] = useState<(RecordList & { records: { count: number }[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });
  const [deleteResults, setDeleteResults] = useState<{ success: string[]; failed: string[] } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (selectedClub) {
      loadRecordLists();
    } else if (!clubLoading) {
      setLoading(false);
    }
  }, [selectedClub, clubLoading]);

  const loadRecordLists = async () => {
    if (!selectedClub) return;

    setLoading(true);
    const supabase = createClient();

    const { data } = await supabase
      .from("record_lists")
      .select("*, records(count)")
      .eq("club_id", selectedClub.id)
      .order("created_at", { ascending: false });

    setRecordLists((data as (RecordList & { records: { count: number }[] })[]) || []);
    setLoading(false);
    setSelectedIds([]);
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === recordLists.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(recordLists.map((list) => list.id));
    }
  };

  const getSelectedRecordCount = () => {
    return recordLists
      .filter((list) => selectedIds.includes(list.id))
      .reduce((sum, list) => sum + (list.records?.[0]?.count || 0), 0);
  };

  const handleBulkDelete = async () => {
    setIsDeleting(true);
    setDeleteProgress({ current: 0, total: selectedIds.length });
    setDeleteResults(null);

    const supabase = createClient();
    const success: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const list = recordLists.find((l) => l.id === id);
      setDeleteProgress({ current: i + 1, total: selectedIds.length });

      const { error } = await supabase.from("record_lists").delete().eq("id", id);

      if (error) {
        failed.push(`${list?.title || id}: ${error.message}`);
      } else {
        success.push(list?.title || id);
      }
    }

    setDeleteResults({ success, failed });
    setIsDeleting(false);

    if (failed.length === 0) {
      setShowDeleteModal(false);
      setSelectedIds([]);
      loadRecordLists();
    }
  };

  const handleExportCSV = async () => {
    if (!selectedClub) return;

    setIsExporting(true);

    const supabase = createClient();

    // Fetch all record lists with their records
    const { data: lists } = await supabase
      .from("record_lists")
      .select("id, title")
      .eq("club_id", selectedClub.id)
      .order("title");

    if (!lists || lists.length === 0) {
      setIsExporting(false);
      return;
    }

    // Fetch all records for these lists
    const listIds = lists.map((l) => l.id);
    const { data: records } = await supabase
      .from("records")
      .select("*")
      .in("record_list_id", listIds)
      .order("sort_order");

    if (!records) {
      setIsExporting(false);
      return;
    }

    // Create a map of list id to title
    const listTitleMap = new Map(lists.map((l) => [l.id, l.title]));

    // Build CSV content
    const csvRows = [
      ["Record List", "Event", "Time", "Swimmer", "Date", "Location", "is_National", "is_Current_National", "is_Provincial", "is_Current_Provincial", "is_Split", "is_RelaySplit", "is_New"].join(","),
    ];

    for (const record of records as SwimRecord[]) {
      const listTitle = listTitleMap.get(record.record_list_id) || "";
      const row = [
        `"${listTitle.replace(/"/g, '""')}"`,
        `"${record.event_name.replace(/"/g, '""')}"`,
        `"${formatMsToTime(record.time_ms)}"`,
        `"${record.swimmer_name.replace(/"/g, '""')}"`,
        `"${record.record_date || ""}"`,
        `"${(record.location || "").replace(/"/g, '""')}"`,
        record.is_national ? "true" : "",
        record.is_current_national ? "true" : "",
        record.is_provincial ? "true" : "",
        record.is_current_provincial ? "true" : "",
        record.is_split ? "true" : "",
        record.is_relay_split ? "true" : "",
        record.is_new ? "true" : "",
      ];
      csvRows.push(row.join(","));
    }

    const csvContent = csvRows.join("\n");

    // Trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${selectedClub.slug}-records.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsExporting(false);
  };

  if (loading || clubLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!selectedClub) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          No club selected
        </h2>
        <p className="mt-2 text-gray-500 dark:text-gray-400">
          Create a club to get started.
        </p>
        <Link
          href="/dashboard/clubs/new"
          className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
        >
          Create Club
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Record Lists
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Manage your club&apos;s record lists by age group, gender, or category.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            disabled={isExporting || recordLists.length === 0}
            className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {isExporting ? "Exporting..." : "Export CSV"}
          </button>
          {canEdit && (
            <>
              <Link
                href="/dashboard/records/bulk-upload"
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Bulk Upload
              </Link>
              <Link
                href="/dashboard/records/new"
                className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
              >
                Create New List
              </Link>
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
          You have read-only access to this club. Contact the owner if you need editing permissions.
        </div>
      )}

      {recordLists.length > 0 ? (
        <>
          {/* Selection Toolbar - only show for editors/owners */}
          {canEdit && (
            <div className="mb-4 flex items-center justify-between rounded-lg bg-gray-100 px-4 py-2 dark:bg-gray-700">
              <div className="flex items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === recordLists.length && recordLists.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {selectedIds.length === 0
                      ? "Select all"
                      : `${selectedIds.length} selected`}
                  </span>
                </label>
                {selectedIds.length > 0 && (
                  <button
                    onClick={() => setSelectedIds([])}
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  >
                    Clear selection
                  </button>
                )}
              </div>
              {selectedIds.length > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="rounded-lg border border-red-300 px-4 py-1.5 text-sm text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  Delete {selectedIds.length} {selectedIds.length === 1 ? "list" : "lists"}
                </button>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {recordLists.map((list) => (
              <div
                key={list.id}
                className={`relative rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800 ${
                  canEdit && selectedIds.includes(list.id) ? "ring-2 ring-blue-500" : ""
                }`}
              >
                {canEdit && (
                  <div className="absolute left-4 top-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(list.id)}
                      onChange={() => toggleSelection(list.id)}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </div>
                )}
                <Link href={`/dashboard/records/${list.id}`} className={`block ${canEdit ? "pl-6" : ""}`}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {list.title}
                  </h3>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      {list.course_type}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {list.records?.[0]?.count || 0} records
                    </span>
                  </div>
                  <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                    /{selectedClub.slug}/{list.slug}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <div className="text-5xl">📋</div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            No record lists yet
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            {canEdit
              ? "Create your first record list to start tracking club records."
              : "No record lists have been created for this club yet."
            }
          </p>
          {canEdit && (
            <Link
              href="/dashboard/records/new"
              className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
            >
              Create Record List
            </Link>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-800">
            {!deleteResults ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Delete {selectedIds.length} {selectedIds.length === 1 ? "list" : "lists"}?
                </h3>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  This will permanently delete {selectedIds.length}{" "}
                  {selectedIds.length === 1 ? "record list" : "record lists"} and{" "}
                  <span className="font-semibold">{getSelectedRecordCount()} records</span>.
                  This action cannot be undone.
                </p>

                {isDeleting && (
                  <div className="mt-4">
                    <div className="mb-2 flex justify-between text-sm text-gray-600 dark:text-gray-400">
                      <span>Deleting...</span>
                      <span>
                        {deleteProgress.current} / {deleteProgress.total}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className="h-full bg-red-500 transition-all"
                        style={{
                          width: `${(deleteProgress.current / deleteProgress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    disabled={isDeleting}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {deleteResults.failed.length === 0 ? "Deletion Complete" : "Deletion Results"}
                </h3>

                {deleteResults.success.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">
                      Successfully deleted ({deleteResults.success.length}):
                    </p>
                    <ul className="mt-1 max-h-32 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
                      {deleteResults.success.map((title, i) => (
                        <li key={i}>• {title}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {deleteResults.failed.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-red-700 dark:text-red-400">
                      Failed to delete ({deleteResults.failed.length}):
                    </p>
                    <ul className="mt-1 max-h-32 overflow-y-auto text-sm text-gray-600 dark:text-gray-400">
                      {deleteResults.failed.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteResults(null);
                      if (deleteResults.success.length > 0) {
                        setSelectedIds([]);
                        loadRecordLists();
                      }
                    }}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
