import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/guard";
import type { Club, RecordList, SwimRecord } from "@/types/database";
import ClubRecordBrowser from "./ClubRecordBrowser";

interface ClubPageProps {
  params: Promise<{ clubSlug: string }>;
  searchParams: Promise<{ list?: string }>;
}

export async function generateMetadata({ params }: ClubPageProps) {
  const { clubSlug } = await params;
  const supabase = await createClient();

  try {
    const club = unwrap<Club>(
      await supabase
        .from("clubs")
        .select("*")
        .eq("slug", clubSlug)
        .maybeSingle(),
      `clubs(meta): slug=${clubSlug}`
    );

    if (!club) {
      return { title: "Club Not Found" };
    }

    return {
      title: `${club.full_name} - Club Records`,
      description: `View club records for ${club.full_name}`,
    };
  } catch {
    return { title: "Club Records" };
  }
}

export default async function ClubPage({ params, searchParams }: ClubPageProps) {
  const { clubSlug } = await params;
  const { list: listSlug } = await searchParams;
  const supabase = await createClient();

  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  const typedLists =
    unwrap<(RecordList & { records: { count: number }[] })[]>(
      await supabase
        .from("record_lists")
        .select("*, records(count)")
        .eq("club_id", club.id)
        .order("title", { ascending: true }),
      `record_lists: club_id=${club.id}`
    ) ?? [];

  if (typedLists.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-2 font-display text-3xl font-semibold text-gray-900 dark:text-white">
          Records
        </h1>
        <div className="rounded-xl bg-white p-12 text-center shadow-sm ring-1 ring-gray-900/5 dark:bg-gray-900 dark:ring-white/10">
          <p className="text-gray-500 dark:text-gray-400">
            No record lists available yet.
          </p>
        </div>
      </div>
    );
  }

  const defaultList =
    (listSlug && typedLists.find((l) => l.slug === listSlug)) || typedLists[0];

  const defaultRecords =
    unwrap<SwimRecord[]>(
      await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", defaultList.id)
        .order("sort_order", { ascending: true }),
      `records: record_list_id=${defaultList.id}`
    ) ?? [];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-2 font-display text-3xl font-semibold text-gray-900 dark:text-white">
        Club Records
      </h1>
      <ClubRecordBrowser
        recordLists={typedLists}
        defaultRecords={defaultRecords}
        defaultListId={defaultList.id}
        clubSlug={club.slug}
      />
    </div>
  );
}
