import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatMsToTime } from "@/lib/time-utils";
import type { Club, RecordList, SwimRecord } from "@/types/database";
import PublicRecordSearch from "./PublicRecordSearch";

interface RecordPageProps {
  params: Promise<{ clubSlug: string; recordSlug: string }>;
}

export async function generateMetadata({ params }: RecordPageProps) {
  const { clubSlug, recordSlug } = await params;
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", clubSlug)
    .single();

  if (!club) {
    return { title: "Not Found" };
  }

  const { data: recordList } = await supabase
    .from("record_lists")
    .select("*")
    .eq("club_id", (club as Club).id)
    .eq("slug", recordSlug)
    .single();

  if (!recordList) {
    return { title: "Not Found" };
  }

  return {
    title: `${(recordList as RecordList).title} - ${(club as Club).short_name} Club Records`,
    description: `${(recordList as RecordList).title} records for ${(club as Club).full_name}`,
  };
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { clubSlug, recordSlug } = await params;
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

  const { data: recordList } = await supabase
    .from("record_lists")
    .select("*")
    .eq("club_id", typedClub.id)
    .eq("slug", recordSlug)
    .single();

  if (!recordList) {
    notFound();
  }

  const typedRecordList = recordList as RecordList;

  const { data: records } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", typedRecordList.id)
    .order("sort_order", { ascending: true });

  const typedRecords = (records || []) as SwimRecord[];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-2">
        <Link
          href={`/${typedClub.slug}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; All Record Lists
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {typedRecordList.title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded bg-blue-100 px-2 py-0.5 text-sm font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {typedRecordList.course_type}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {typedRecords.length} records
            </span>
          </div>
        </div>
      </div>

      <PublicRecordSearch records={typedRecords} formatTime={formatMsToTime} />
    </div>
  );
}
