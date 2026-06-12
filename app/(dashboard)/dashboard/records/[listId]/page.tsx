"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import RecordTable from "@/components/RecordTable";
import LastUpdated from "@/components/LastUpdated";
import { maxIso } from "@/lib/date-utils";
import CSVUploader from "@/components/CSVUploader";
import EmbedCodeSnippet from "@/components/EmbedCodeSnippet";
import LoadError from "@/components/LoadError";
import type { RecordList, SwimRecord } from "@/types/database";
import type { CSVRecord } from "@/lib/csv-parser";
import type { HistoryFlagUpdate } from "@/components/RecordTable";

export default function RecordListDetailPage() {
  const router = useRouter();
  const params = useParams();
  const listId = params.listId as string;
  const { selectedClub, canEdit } = useClub();

  const [recordList, setRecordList] = useState<RecordList | null>(null);
  const [records, setRecords] = useState<SwimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showCSVUpload, setShowCSVUpload] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editCourseType, setEditCourseType] = useState<"LCM" | "SCM" | "SCY">("LCM");
  const [editGender, setEditGender] = useState<"male" | "female" | "mixed">("male");
  const [ageGroups, setAgeGroups] = useState<string[]>([]);
  const [relayEvents, setRelayEvents] = useState<string[]>([]);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    setLoadError(false);
    try {
      const supabase = createClient();

      const { data: listData, error: listError } = await supabase
        .from("record_lists")
        .select("*")
        .eq("id", listId)
        .maybeSingle();
      if (listError) throw listError;

      if (listData) {
        setRecordList(listData as RecordList);
        setEditTitle(listData.title);
        setEditCourseType(listData.course_type as "LCM" | "SCM" | "SCY");
        setEditGender((listData.gender as "male" | "female" | "mixed") || "male");
      }

      const { data: recordsData, error: recordsError } = await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", listId)
        .order("sort_order", { ascending: true });
      if (recordsError) throw recordsError;

      if (recordsData) {
        setRecords(recordsData as SwimRecord[]);
      }

      const { data: ageGroupData } = await supabase
        .from("standard_age_groups")
        .select("name")
        .order("sort_order", { ascending: true });
      if (ageGroupData) {
        setAgeGroups(ageGroupData.map((a) => a.name as string));
      }

      const { data: relayEventData } = await supabase
        .from("standard_events")
        .select("name")
        .eq("kind", "relay")
        .order("sort_order", { ascending: true });
      if (relayEventData) {
        setRelayEvents(relayEventData.map((e) => e.name as string));
      }
    } catch (e) {
      console.error("[data-access] dashboard: list detail", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [listId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveRecords = async (
    editableRecords: Array<Omit<SwimRecord, "id" | "created_at" | "updated_at" | "record_list_id"> & { id?: string; isNew?: boolean; _breakingRecordId?: string }>,
    historyUpdates?: HistoryFlagUpdate[]
  ) => {
    try {
      const supabase = createClient();

      // Separate new and existing records
      const newRecords = editableRecords.filter((r) => !r.id || r.isNew);
      const existingRecords = editableRecords.filter((r) => r.id && !r.isNew);

      // Track which old records need to be marked as superseded
      const recordsToSupersede: Array<{ oldId: string; newId: string }> = [];

      // Insert new records one by one to get their IDs for linking
      for (const r of newRecords) {
        const { data: insertedRecord, error } = await supabase
          .from("records")
          .insert({
            record_list_id: listId,
            event_name: r.event_name,
            time_ms: r.time_ms,
            swimmer_name: r.swimmer_name,
            swimmer_name_2: r.swimmer_name_2 ?? null,
            swimmer_name_3: r.swimmer_name_3 ?? null,
            swimmer_name_4: r.swimmer_name_4 ?? null,
            age_group: r.age_group ?? null,
            record_club: r.record_club ?? null,
            province: r.province ?? null,
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
            is_current: true,
            superseded_by: null,
          })
          .select()
          .single();

        if (error) {
          setMessage({ type: "error", text: error.message });
          return;
        }

        // If this new record is breaking an old one, track it for linking
        if (r._breakingRecordId && insertedRecord) {
          recordsToSupersede.push({
            oldId: r._breakingRecordId,
            newId: insertedRecord.id,
          });
        }
      }

      // Mark old records as superseded
      for (const { oldId, newId } of recordsToSupersede) {
        const { error } = await supabase
          .from("records")
          .update({
            superseded_by: newId,
            is_current: false,
          })
          .eq("id", oldId);

        if (error) {
          setMessage({ type: "error", text: error.message });
          return;
        }

        // Re-parent any older history records that pointed to the old record
        // so the full chain is visible when looking up the new current record
        await supabase
          .from("records")
          .update({ superseded_by: newId })
          .eq("superseded_by", oldId);
      }

      // Update existing records
      for (const record of existingRecords) {
        const { error } = await supabase
          .from("records")
          .update({
            event_name: record.event_name,
            time_ms: record.time_ms,
            swimmer_name: record.swimmer_name,
            swimmer_name_2: record.swimmer_name_2 ?? null,
            swimmer_name_3: record.swimmer_name_3 ?? null,
            swimmer_name_4: record.swimmer_name_4 ?? null,
            age_group: record.age_group ?? null,
            record_club: record.record_club ?? null,
            province: record.province ?? null,
            record_date: record.record_date,
            location: record.location,
            sort_order: record.sort_order,
            is_national: record.is_national || false,
            is_current_national: record.is_current_national || false,
            is_provincial: record.is_provincial || false,
            is_current_provincial: record.is_current_provincial || false,
            is_split: record.is_split || false,
            is_relay_split: record.is_relay_split || false,
            is_new: record.is_new || false,
            is_world_record: record.is_world_record || false,
          })
          .eq("id", record.id);

        if (error) {
          setMessage({ type: "error", text: error.message });
          return;
        }
      }

      // Update history record flags
      if (historyUpdates) {
        for (const update of historyUpdates) {
          const { error } = await supabase
            .from("records")
            .update({
              is_national: update.flags.is_national,
              is_current_national: update.flags.is_current_national,
              is_provincial: update.flags.is_provincial,
              is_current_provincial: update.flags.is_current_provincial,
              is_split: update.flags.is_split,
              is_relay_split: update.flags.is_relay_split,
              is_new: update.flags.is_new,
              is_world_record: update.flags.is_world_record,
            })
            .eq("id", update.id);

          if (error) {
            setMessage({ type: "error", text: error.message });
            return;
          }
        }
      }

      setMessage({ type: "success", text: "Records saved successfully!" });
      loadData();
    } catch (e) {
      console.error("[mutation] dashboard: save records", e);
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("records").delete().eq("id", id);

      if (error) {
        setMessage({ type: "error", text: error.message });
      }
    } catch (e) {
      console.error("[mutation] dashboard: delete record", e);
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleCSVUpload = async (csvRecords: CSVRecord[]) => {
    try {
      const supabase = createClient();

      // Filter to only count current records for sort_order
      const currentRecordsCount = records.filter(r => r.is_current !== false).length;

      const { error } = await supabase.from("records").insert(
        csvRecords.map((r, i) => ({
          record_list_id: listId,
          event_name: r.event_name,
          time_ms: r.time_ms,
          swimmer_name: r.swimmer_name,
          swimmer_name_2: r.swimmer_name_2,
          swimmer_name_3: r.swimmer_name_3,
          swimmer_name_4: r.swimmer_name_4,
          age_group: r.age_group,
          record_club: r.record_club,
          province: r.province,
          record_date: r.record_date,
          location: r.location,
          sort_order: currentRecordsCount + i,
          is_national: r.is_national || false,
          is_current_national: r.is_current_national || false,
          is_provincial: r.is_provincial || false,
          is_current_provincial: r.is_current_provincial || false,
          is_split: r.is_split || false,
          is_relay_split: r.is_relay_split || false,
          is_new: r.is_new || false,
          is_world_record: r.is_world_record || false,
          is_current: true,
          superseded_by: null,
        }))
      );

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: `Imported ${csvRecords.length} records!` });
        setShowCSVUpload(false);
        loadData();
      }
    } catch (e) {
      console.error("[mutation] dashboard: csv upload", e);
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleUpdateList = async () => {
    if (!recordList) return;

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("record_lists")
        .update({
          title: editTitle,
          course_type: editCourseType,
          gender: editGender,
        })
        .eq("id", listId);

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        setMessage({ type: "success", text: "List updated!" });
        setIsEditing(false);
        loadData();
      }
    } catch (e) {
      console.error("[mutation] dashboard: update list", e);
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  const handleDeleteList = async () => {
    try {
      const supabase = createClient();
      const { error } = await supabase.from("record_lists").delete().eq("id", listId);

      if (error) {
        setMessage({ type: "error", text: error.message });
      } else {
        router.push("/dashboard/records");
      }
    } catch (e) {
      console.error("[mutation] dashboard: delete list", e);
      setMessage({ type: "error", text: "Something went wrong. Please try again." });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  if (loadError) {
    return <LoadError onRetry={loadData} />;
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

        {isEditing && canEdit ? (
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
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Gender
              </label>
              <select
                value={editGender}
                onChange={(e) => setEditGender(e.target.value as "male" | "female" | "mixed")}
                className="mt-1 block rounded-lg border border-gray-300 px-4 py-2 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                {recordList?.record_type === "relay" && <option value="mixed">Mixed</option>}
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
              <h1 className="font-display text-3xl font-semibold text-gray-900 dark:text-white">
                {recordList.title}
              </h1>
              <div className="mt-2 flex items-center gap-3">
                <span className="rounded bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {recordList.course_type}
                </span>
                {recordList.gender && (
                  <span className="rounded bg-purple-100 px-2 py-0.5 text-sm font-medium text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                    {recordList.gender === "male" ? "Male" : recordList.gender === "female" ? "Female" : "Mixed"}
                  </span>
                )}
                {recordList.record_type === "relay" && (
                  <span className="rounded bg-teal-100 px-2 py-0.5 text-sm font-medium text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                    Relay · {recordList.scope === "national" ? "National" : recordList.scope === "provincial" ? "Provincial" : "Club"}
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  /{selectedClub?.slug}/{recordList.slug}
                </span>
              </div>
              <div className="mt-2">
                <LastUpdated
                  iso={maxIso([
                    recordList.updated_at,
                    ...records.map((r) => r.updated_at),
                  ])}
                />
              </div>
            </div>
            {canEdit && (
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
            )}
          </div>
        )}
      </div>

      {!canEdit && (
        <div className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/50 dark:text-amber-400">
          You have read-only access to this club. Contact the owner if you need editing permissions.
        </div>
      )}

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
          {canEdit && (
            <button
              onClick={() => setShowCSVUpload(!showCSVUpload)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              {showCSVUpload ? "Hide CSV Import" : "Import CSV"}
            </button>
          )}
        </div>

        {showCSVUpload && canEdit && (
          <div className="mb-6">
            <CSVUploader
              onUpload={handleCSVUpload}
              relay={recordList.record_type === "relay"}
              scope={recordList.scope}
              allowedAgeGroups={ageGroups}
              relayEvents={relayEvents}
            />
          </div>
        )}

        <RecordTable
          records={records}
          onSave={handleSaveRecords}
          onDelete={handleDeleteRecord}
          readOnly={!canEdit}
          courseType={recordList.course_type as "LCM" | "SCM" | "SCY"}
          recordType={recordList.record_type}
          scope={recordList.scope}
          ageGroups={ageGroups}
          relayEvents={relayEvents}
        />
      </div>

      {selectedClub && recordList && (
        <div className="mb-6">
          <EmbedCodeSnippet
            clubSlug={selectedClub.slug}
            listSlug={recordList.slug}
            listTitle={recordList.title}
          />
        </div>
      )}

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
