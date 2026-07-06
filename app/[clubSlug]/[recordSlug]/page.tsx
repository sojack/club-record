import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { unwrap } from "@/lib/supabase/guard";
import type { Club, RecordList, SwimRecord } from "@/types/database";
import PublicRecordSearch from "./PublicRecordSearch";
import TrackView from "@/components/TrackView";

interface RecordPageProps {
  params: Promise<{ clubSlug: string; recordSlug: string }>;
}

export async function generateMetadata({ params }: RecordPageProps) {
  const { clubSlug, recordSlug } = await params;
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
      return { title: "Not Found" };
    }

    const recordList = unwrap<RecordList>(
      await supabase
        .from("record_lists")
        .select("*")
        .eq("club_id", club.id)
        .eq("slug", recordSlug)
        .maybeSingle(),
      `record_lists(meta): club_id=${club.id} slug=${recordSlug}`
    );

    if (!recordList) {
      return { title: "Not Found" };
    }

    return {
      title: `${recordList.title} - ${club.short_name} Club Records`,
      description: `${recordList.title} records for ${club.full_name}`,
    };
  } catch {
    return { title: "Club Records" };
  }
}

export default async function RecordPage({ params }: RecordPageProps) {
  const { clubSlug, recordSlug } = await params;
  const supabase = await createClient();

  const club = unwrap<Club>(
    await supabase.from("clubs").select("*").eq("slug", clubSlug).maybeSingle(),
    `clubs: slug=${clubSlug}`
  );

  if (!club) {
    notFound();
  }

  const typedRecordList = unwrap<RecordList>(
    await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", club.id)
      .eq("slug", recordSlug)
      .maybeSingle(),
    `record_lists: club_id=${club.id} slug=${recordSlug}`
  );

  if (!typedRecordList) {
    notFound();
  }

  const typedRecords =
    unwrap<SwimRecord[]>(
      await supabase
        .from("records")
        .select("*")
        .eq("record_list_id", typedRecordList.id)
        .order("sort_order", { ascending: true }),
      `records: record_list_id=${typedRecordList.id}`
    ) ?? [];
  const currentRecordsCount = typedRecords.filter(r => r.is_current !== false).length;

  return (
    <div className="container mx-auto px-4 py-8">
      <TrackView clubSlug={clubSlug} listSlug={recordSlug} />
      <div className="mb-2">
        <Link
          href={`/${club.slug}`}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          &larr; All Record Lists
        </Link>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold text-gray-900 dark:text-white">
            {typedRecordList.title}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full border border-gold-300 bg-gold-50 px-2.5 py-0.5 text-sm font-semibold text-gold-800 dark:border-gold-700 dark:bg-gold-950/50 dark:text-gold-300">
              {typedRecordList.course_type}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {currentRecordsCount} records
            </span>
          </div>
        </div>
      </div>

      <PublicRecordSearch
        records={typedRecords}
        recordType={typedRecordList.record_type}
        scope={typedRecordList.scope}
      />
    </div>
  );
}
