"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { RecordList, SwimRecord } from "@/types/database";
import PublicRecordSearch from "./[recordSlug]/PublicRecordSearch";

type RecordListWithCount = RecordList & { records: { count: number }[] };

interface ClubRecordBrowserProps {
  recordLists: RecordListWithCount[];
  defaultRecords: SwimRecord[];
  defaultListId: string;
  clubSlug: string;
}

const COURSE_TYPE_ORDER: RecordList["course_type"][] = ["SCM", "SCY", "LCM"];
const GENDER_ORDER: Array<RecordList["gender"]> = ["male", "female", "mixed"];

// Get display label for a group (course type + gender)
function getGroupLabel(courseType: string, gender: string | null): string {
  if (!gender) return courseType;
  const genderLabel =
    gender === "male" ? "Male" : gender === "female" ? "Female" : "Mixed";
  return `${courseType} ${genderLabel}`;
}

export default function ClubRecordBrowser({
  recordLists,
  defaultRecords,
  defaultListId,
  clubSlug,
}: ClubRecordBrowserProps) {
  const [selectedListId, setSelectedListId] = useState(defaultListId);
  const [records, setRecords] = useState<SwimRecord[]>(defaultRecords);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const selectedList = recordLists.find((l) => l.id === selectedListId);

  // Group lists by course type and gender
  const groupedLists: Array<{ label: string; lists: RecordListWithCount[] }> = [];

  for (const courseType of COURSE_TYPE_ORDER) {
    for (const gender of GENDER_ORDER) {
      const lists = recordLists.filter(
        (l) => l.course_type === courseType && l.gender === gender
      );
      if (lists.length > 0) {
        groupedLists.push({
          label: getGroupLabel(courseType, gender),
          lists,
        });
      }
    }
    // Also include lists without gender set (for backwards compatibility)
    const listsWithoutGender = recordLists.filter(
      (l) => l.course_type === courseType && !l.gender
    );
    if (listsWithoutGender.length > 0) {
      groupedLists.push({
        label: courseType,
        lists: listsWithoutGender,
      });
    }
  }

  const handleListChange = async (listId: string) => {
    setSelectedListId(listId);

    const list = recordLists.find((l) => l.id === listId);
    if (list) {
      const url = `/${clubSlug}?list=${list.slug}`;
      window.history.replaceState(null, "", url);
    }

    if (listId === defaultListId) {
      setLoadError(false);
      setRecords(defaultRecords);
      return;
    }

    setLoading(true);
    setLoadError(false);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("records")
      .select("*")
      .eq("record_list_id", listId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error(`[data-access] records: record_list_id=${listId}`, error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setRecords((data as SwimRecord[]) || []);
    setLoading(false);
  };

  const currentRecordsCount = records.filter(
    (r) => r.is_current !== false
  ).length;

  return (
    <div>
      <div className="mb-6">
        <select
          value={selectedListId}
          onChange={(e) => handleListChange(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
        >
          {groupedLists.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title} ({list.records?.[0]?.count || 0} records)
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {selectedList && (
        <div className="mb-6 flex items-center gap-3">
          <h2 className="font-display text-2xl font-semibold text-gray-900 dark:text-white">
            {selectedList.title}
          </h2>
          <span className="rounded-full border border-gold-300 bg-gold-50 px-2.5 py-0.5 text-sm font-semibold text-gold-800 dark:border-gold-700 dark:bg-gold-950/50 dark:text-gold-300">
            {selectedList.course_type}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {currentRecordsCount} records
          </span>
        </div>
      )}

      {loadError ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
          <p className="mb-4 text-gray-500 dark:text-gray-400">
            Couldn&apos;t load that list. Please try again.
          </p>
          <button
            onClick={() => handleListChange(selectedListId)}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      ) : loading ? (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
          <p className="text-gray-500 dark:text-gray-400">
            Loading records...
          </p>
        </div>
      ) : (
        <PublicRecordSearch
          records={records}
          recordType={selectedList?.record_type ?? "individual"}
          scope={selectedList?.scope ?? "club"}
        />
      )}
    </div>
  );
}
