import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Club, RecordList, SwimRecord } from "@/types/database";
import ClubRecordBrowser from "./ClubRecordBrowser";

interface ClubPageProps {
  params: Promise<{ clubSlug: string }>;
  searchParams: Promise<{ list?: string }>;
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

export default async function ClubPage({ params, searchParams }: ClubPageProps) {
  const { clubSlug } = await params;
  const { list: listSlug } = await searchParams;
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

  const typedLists = (recordLists || []) as (RecordList & {
    records: { count: number }[];
  })[];

  if (typedLists.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
          Club Records
        </h1>
        <div className="rounded-xl bg-white p-12 text-center shadow-sm dark:bg-gray-800">
          <p className="text-gray-500 dark:text-gray-400">
            No record lists available yet.
          </p>
        </div>
      </div>
    );
  }

  const defaultList =
    (listSlug && typedLists.find((l) => l.slug === listSlug)) || typedLists[0];

  const { data: defaultRecordsData } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", defaultList.id)
    .order("sort_order", { ascending: true });

  const defaultRecords = (defaultRecordsData || []) as SwimRecord[];

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">
        Club Records
      </h1>
      <ClubRecordBrowser
        recordLists={typedLists}
        defaultRecords={defaultRecords}
        defaultListId={defaultList.id}
        clubSlug={typedClub.slug}
      />
    </div>
  );
}
