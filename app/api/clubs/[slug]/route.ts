import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { unwrap, dbErrorToResponse, DataAccessError } from "@/lib/supabase/guard";
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

  try {
    const supabase = await createClient();

    const club = unwrap<Club>(
      await supabase.from("clubs").select("*").eq("slug", slug).maybeSingle(),
      `clubs: slug=${slug}`
    );

    if (!club) {
      return NextResponse.json(
        { error: "Club not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const lists =
      unwrap<RecordList[]>(
        await supabase
          .from("record_lists")
          .select("*")
          .eq("club_id", club.id)
          .order("created_at", { ascending: true }),
        `record_lists: club_id=${club.id}`
      ) ?? [];

    return NextResponse.json(
      {
        slug: club.slug,
        short_name: club.short_name,
        full_name: club.full_name,
        logo_url: club.logo_url,
        record_lists: lists.map((l) => ({
          slug: l.slug,
          title: l.title,
          course_type: l.course_type,
          gender: l.gender,
        })),
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    if (!(err instanceof DataAccessError)) {
      console.error("[route] clubs/[slug]: unexpected error", err);
    }
    return dbErrorToResponse(corsHeaders);
  }
}
