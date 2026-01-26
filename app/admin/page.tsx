import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Club } from "@/types/database";

export default async function AdminPage() {
  const supabase = await createClient();

  // Fetch all clubs (admin can see all)
  const { data: clubs } = await supabase
    .from("clubs")
    .select("*, record_lists(count)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          All Clubs
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Select a club to upload data for them.
        </p>
      </div>

      {clubs && clubs.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(clubs as (Club & { record_lists: { count: number }[] })[]).map((club) => (
            <div
              key={club.id}
              className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {club.full_name}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {club.short_name} &bull; /{club.slug}
              </p>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {club.record_lists?.[0]?.count || 0} record lists
              </p>
              <div className="mt-4 flex gap-2">
                <Link
                  href={`/admin/${club.id}/upload`}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                >
                  Upload Data
                </Link>
                <Link
                  href={`/${club.slug}`}
                  target="_blank"
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  View Public
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">No clubs found.</p>
        </div>
      )}
    </div>
  );
}
