"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useClub } from "@/contexts/ClubContext";
import type { RecordList } from "@/types/database";

export default function DashboardPage() {
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

  const totalRecords = recordLists.reduce(
    (acc, list) => acc + (list.records?.[0]?.count || 0),
    0
  );

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
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Welcome, {selectedClub.full_name}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Manage your club records and share them with your community.
        </p>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Record Lists
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {recordLists.length}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Total Records
          </div>
          <div className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
            {totalRecords}
          </div>
        </div>
        <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
          <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Public URL
          </div>
          <div className="mt-2 text-lg font-medium text-blue-600 dark:text-blue-400">
            /{selectedClub.slug}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Recent Record Lists
          </h2>
          <Link
            href="/dashboard/records/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Create New List
          </Link>
        </div>

        {recordLists.length > 0 ? (
          <div className="space-y-3">
            {recordLists.slice(0, 5).map((list) => (
              <Link
                key={list.id}
                href={`/dashboard/records/${list.id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">
                    {list.title}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {list.course_type} • /{selectedClub.slug}/{list.slug}
                  </div>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {list.records?.[0]?.count || 0} records
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-gray-500 dark:text-gray-400">
            <p>No record lists yet.</p>
            <Link
              href="/dashboard/records/new"
              className="mt-2 inline-block text-blue-600 hover:underline dark:text-blue-400"
            >
              Create your first record list
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
