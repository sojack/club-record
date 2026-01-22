import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Club, RecordList } from "@/types/database";

interface ClubPageProps {
  params: Promise<{ clubSlug: string }>;
}

export async function generateMetadata({ params }: ClubPageProps) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    return { title: "Club Not Found" };
  }

  return {
    title: `${(club as Club).full_name} - Club Records`,
    description: `View club records for ${(club as Club).full_name}`,
  };
}

export default async function ClubPage({ params }: ClubPageProps) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    notFound();
  }

  const typedClub = club as Club;

  const { data: recordLists } = await supabase
    .from("record_lists")
    .select("*, records(count)")
    .eq("club_id", typedClub.id)
    .order("title", { ascending: true });

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        Club Records
      </h1>
      <p className="mb-8 text-gray-600 dark:text-gray-400">
        {typedClub.full_name}
      </p>

      {recordLists && recordLists.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(recordLists as (RecordList & { records: { count: number }[] })[]).map((list) => (
            <Link
              key={list.id}
              href={`/${typedClub.slug}/${list.slug}`}
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
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            No record lists available yet.
          </p>
        </div>
      )}
    </div>
  );
}
