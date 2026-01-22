"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import type { RecordList } from "@/types/database";

export default function RecordListsPage() {
  const { selectedClub, isLoading: clubLoading } = useClub();
  const [recordLists, setRecordLists] = useState<(RecordList & { records: { count: number }[] })[]>([]);
  const [loading, setLoading] = useState(true);

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
        <Link
          href="/dashboard/records/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          Create New List
        </Link>
      </div>

      {recordLists.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {recordLists.map((list) => (
            <Link
              key={list.id}
              href={`/dashboard/records/${list.id}`}
              className="rounded-xl bg-white p-6 shadow-sm transition-shadow hover:shadow-md dark:bg-gray-800"
            >
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
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <div className="text-5xl">📋</div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900 dark:text-white">
            No record lists yet
          </h3>
          <p className="mt-2 text-gray-500 dark:text-gray-400">
            Create your first record list to start tracking club records.
          </p>
          <Link
            href="/dashboard/records/new"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
          >
            Create Record List
          </Link>
        </div>
      )}
    </div>
  );
}
