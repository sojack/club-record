import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Club, RecordList, SwimRecord } from "@/types/database";
import PublicRecordSearch from "@/app/[clubSlug]/[recordSlug]/PublicRecordSearch";

interface EmbedPageProps {
  params: Promise<{ clubSlug: string }>;
  searchParams: Promise<{ list?: string }>;
}

export default async function EmbedPage({
  params,
  searchParams,
}: EmbedPageProps) {
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

  // Find the requested list, or default to the first one
  let recordList: RecordList | null = null;

  if (listSlug) {
    const { data } = await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", typedClub.id)
      .eq("slug", listSlug)
      .single();
    recordList = data as RecordList | null;
  } else {
    const { data } = await supabase
      .from("record_lists")
      .select("*")
      .eq("club_id", typedClub.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    recordList = data as RecordList | null;
  }

  if (!recordList) {
    notFound();
  }

  const { data: records } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", recordList.id)
    .order("sort_order", { ascending: true });

  const typedRecords = (records || []) as SwimRecord[];

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {recordList.title}
        </h1>
        <span className="mt-1 inline-block rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-300">
          {recordList.course_type}
        </span>
      </div>
      <PublicRecordSearch records={typedRecords} />
    </div>
  );
}
