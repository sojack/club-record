import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatMsToTime } from "@/lib/time-utils";
import type { Club, RecordList, SwimRecord } from "@/types/database";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function formatRecord(r: SwimRecord) {
  return {
    event_name: r.event_name,
    swimmer_name: r.swimmer_name,
    time_ms: r.time_ms,
    time_formatted: r.time_ms > 0 ? formatMsToTime(r.time_ms) : "",
    record_date: r.record_date,
    location: r.location,
    flags: {
      is_national: r.is_national,
      is_current_national: r.is_current_national,
      is_provincial: r.is_provincial,
      is_current_provincial: r.is_current_provincial,
      is_split: r.is_split,
      is_relay_split: r.is_relay_split,
      is_new: r.is_new,
      is_world_record: r.is_world_record,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const listSlug = request.nextUrl.searchParams.get("list");
  const supabase = await createClient();

  const { data: club } = await supabase
    .from("clubs")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!club) {
    return NextResponse.json(
      { error: "Club not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  const typedClub = club as Club;

  // Find the requested list, or default to the first one
  const { data: recordList } = listSlug
    ? await supabase
        .from("record_lists")
        .select("*")
        .eq("club_id", typedClub.id)
        .eq("slug", listSlug)
        .single()
    : await supabase
        .from("record_lists")
        .select("*")
        .eq("club_id", typedClub.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

  if (!recordList) {
    return NextResponse.json(
      { error: "Record list not found" },
      { status: 404, headers: corsHeaders }
    );
  }

  const typedList = recordList as RecordList;

  const { data: records } = await supabase
    .from("records")
    .select("*")
    .eq("record_list_id", typedList.id)
    .order("sort_order", { ascending: true });

  const typedRecords = (records || []) as SwimRecord[];

  // Separate current and history records
  const currentRecords = typedRecords.filter((r) => r.is_current !== false);
  const historyRecords = typedRecords.filter((r) => r.is_current === false);

  // Build history map keyed by the current record's ID
  const historyByRecordId = new Map<string, SwimRecord[]>();
  for (const hr of historyRecords) {
    if (hr.superseded_by) {
      const existing = historyByRecordId.get(hr.superseded_by) || [];
      existing.push(hr);
      historyByRecordId.set(hr.superseded_by, existing);
    }
  }

  // Sort history by date descending
  historyByRecordId.forEach((recs) => {
    recs.sort((a, b) => {
      if (!a.record_date && !b.record_date) return 0;
      if (!a.record_date) return 1;
      if (!b.record_date) return -1;
      return b.record_date.localeCompare(a.record_date);
    });
  });

  const responseRecords = currentRecords.map((r) => ({
    ...formatRecord(r),
    history: (historyByRecordId.get(r.id) || []).map(formatRecord),
  }));

  return NextResponse.json(
    {
      club_slug: typedClub.slug,
      club_name: typedClub.short_name,
      list: {
        slug: typedList.slug,
        title: typedList.title,
        course_type: typedList.course_type,
        gender: typedList.gender,
      },
      records: responseRecords,
    },
    { headers: corsHeaders }
  );
}
