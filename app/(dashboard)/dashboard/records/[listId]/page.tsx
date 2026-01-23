"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import RecordTable from "@/components/RecordTable";
import CSVUploader from "@/components/CSVUploader";
import type { RecordList, SwimRecord } from "@/types/database";
import type { CSVRecord } from "@/lib/csv-parser";

export default function RecordListDetailPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const { selectedClub } = useClub();

  const [recordList, setRecordList] = useState<RecordList | null>(null);
  const [records, setRecords] = useState<SwimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCourseType, setEditCourseType] = useState<"LCM" | "SCM" | "SCY">("LCM");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const supabase = createClient();

    const { data: listData } = await supabase
      .from("record_lists")
      .select("*")
      .eq("id", listId)
      .single();

    if (listData) {
      setRecordList(listData as RecordList);
      setEditTitle(listData.title);
      setEditCourseType(listData.course_type as "LCM" | "SCM" | "SCY");
    }

    const { data: recordsData } = await supabase
      .from("records")
      .select("*")
      .eq("record_list_id", listId)
      .order("sort_order", { ascending: true });

    if (recordsData) {
      setRecords(recordsData as SwimRecord[]);
    }

    setLoading(false);
  }, [listId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRecords = async (
    editableRecords: Array<Omit<SwimRecord, "id" | "created_at" | "record_list_id"> & { id?: string; isNew?: boolean }>
  ) => {
    const supabase = createClient();

    // Separate new and existing records
    const newRecords = editableRecords.filter((r) => !r.id || r.isNew);
    const existingRecords = editableRecords.filter((r) => r.id && !r.isNew);

    // Insert new records
    if (newRecords.length > 0) {
      const { error } = await supabase.from("records").insert(
        newRecords.map((r, i) => ({
          record_list_id: listId,
          event_name: r.event_name,
          time_ms: r.time_ms,
          swimmer_name: r.swimmer_name,
          record_date: r.record_date,
          location: r.location,
          sort_order: existingRecords.length + i,
          is_national: r.is_national || false,
          is_provincial: r.is_provincial || false,
          is_split: r.is_split || false,
          is_relay_split: r.is_relay_split || false,
          is_new: r.is_new || false,
        }))
      );

      if (error) {
        setMessage({ type: "error", text: error.message });
        return;
      }
    }

    // Update existing records
    for (const record of existingRecords) {
      const { error } = await supabase
        .from("records")
        .update({
          event_name: record.event_name,
          time_ms: record.time_ms,
          swimmer_name: record.swimmer_name,
          record_date: record.record_date,
          location: record.location,
          sort_order: record.sort_order,
          is_national: record.is_national || false,
          is_provincial: record.is_provincial || false,
          is_split: record.is_split || false,
          is_relay_split: record.is_relay_split || false,
          is_new: record.is_new || false,
        })
        .eq("id", record.id);

      if (error) {
        setMessage({ type: "error", text: error.message });
        return;
      }
    }

    setMessage({ type: "success", text: "Records saved successfully!" });
    loadData();
  };

  const handleDeleteRecord = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase.from("records").delete().eq("id", id);

    if (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const handleCSVUpload = async (csvRecords: CSVRecord[]) => {
    const supabase = createClient();

    const { error } = await supabase.from("records").insert(
      csvRecords.map((r, i) => ({
        record_list_id: listId,
        event_name: r.event_name,
        time_ms: r.time_ms,
        swimmer_name: r.swimmer_name,
        record_date: r.record_date,
        location: r.location,
        sort_order: records.length + i,
        is_national: r.is_national || false,
        is_provincial: r.is_provincial || false,
        is_split: r.is_split || false,
        is_relay_split: r.is_relay_split || false,
        is_new: r.is_new || false,
      }))
    );

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: `Imported ${csvRecords.length} records!` });
      setShowCSVUpload(false);
      loadData();
    }
  };

  const handleUpdateList = async () => {
    if (!recordList) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("record_lists")
      .update({
        title: editTitle,
        course_type: editCourseType,
      })
      .eq("id", listId);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "List updated!" });
      setIsEditing(false);
      loadData();
    }
  };

  const handleDeleteList = async () => {
    const supabase = createClient();
    const { error } = await supabase.from("record_lists").delete().eq("id", listId);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      router.push("/dashboard/records");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (!recordList) {
    return (
      <div className="py-12 text-center">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          Record list not found
        </h2>
        <Link
          href="/dashboard/records"
          className="mt-4 inline-block text-blue-600 hover:underline dark:text-blue-400"
        >
          Back to Record Lists
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <Link
          href="/dashboard/records"
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; Back to Record Lists
        </Link>

        {isEditing ? (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Title
              </label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1 block w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Course Type
              </label>
              <select
                value={editCourseType}
                onChange={(e) => setEditCourseType(e.target.value as "LCM" | "SCM" | "SCY")}
                className="mt-1 block rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="LCM">Long Course Meters (LCM)</option>
                <option value="SCM">Short Course Meters (SCM)</option>
                <option value="SCY">Short Course Yards (SCY)</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleUpdateList}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {recordList.title}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {recordList.course_type}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /{selectedClub?.slug}/{recordList.slug}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsEditing(true)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Edit
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-900/20"
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>

      {message && (
        <div
          className={`mb-6 rounded-lg p-4 text-sm ${
            message.type === "success"
              ? "bg-green-50 text-green-600 dark:bg-green-900/50 dark:text-green-400"
              : "bg-red-50 text-red-600 dark:bg-red-900/50 dark:text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mb-6 rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Records
          </h2>
          <button
            onClick={() => setShowCSVUpload(!showCSVUpload)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            {showCSVUpload ? "Hide CSV Import" : "Import CSV"}
          </button>
        </div>

        {showCSVUpload && (
          <div className="mb-6">
            <CSVUploader onUpload={handleCSVUpload} />
          </div>
        )}

        <RecordTable
          records={records}
          onSave={handleSaveRecords}
          onDelete={handleDeleteRecord}
        />
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white p-6 dark:bg-gray-800">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Delete Record List
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Are you sure you want to delete &quot;{recordList.title}&quot;? This will
              also delete all {records.length} records in this list. This action
              cannot be undone.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteList}
                className="flex-1 rounded-lg bg-red-600 py-2 text-white hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
