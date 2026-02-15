import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Club, RecordList } from "@/types/database";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
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

  const { data: lists } = await supabase
    .from("record_lists")
    .select("*")
    .eq("club_id", typedClub.id)
    .order("created_at", { ascending: true });

  const typedLists = (lists || []) as RecordList[];

  return NextResponse.json(
    {
      slug: typedClub.slug,
      short_name: typedClub.short_name,
      full_name: typedClub.full_name,
      logo_url: typedClub.logo_url,
      record_lists: typedLists.map((l) => ({
        slug: l.slug,
        title: l.title,
        course_type: l.course_type,
        gender: l.gender,
      })),
    },
    { headers: corsHeaders }
  );
}
