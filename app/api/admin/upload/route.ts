import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scopeForClubLevel } from "@/lib/scope";
import { parseJsonBody } from "@/lib/validation/parse";
import { uploadSchema } from "./schema";

export async function POST(request: NextRequest) {
  // Verify user is admin
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Parse + validate request body
  const parsed = await parseJsonBody(request, uploadSchema);
  if (!parsed.ok) return parsed.response;
  const { clubId, title, slug, courseType, gender, recordType, records } =
    parsed.data;

  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  // Derive scope from club's level
  const { data: clubRow } = await adminClient
    .from("clubs")
    .select("level")
    .eq("id", clubId)
    .single();
  const listScope = scopeForClubLevel(
    (clubRow?.level ?? "regular") as "regular" | "provincial" | "national"
  );

  // Create record list
  const { data: listData, error: listError } = await adminClient
    .from("record_lists")
    .insert({
      club_id: clubId,
      title,
      slug,
      course_type: courseType,
      gender: gender ?? null,
      record_type: recordType ?? "individual",
      scope: listScope,
    })
    .select()
    .single();

  if (listError) {
    return NextResponse.json({ error: listError.message }, { status: 400 });
  }

  // Insert records
  const { error: recordsError } = await adminClient.from("records").insert(
    records.map((r, idx) => ({
      record_list_id: listData.id,
      event_name: r.event_name,
      time_ms: r.time_ms,
      swimmer_name: r.swimmer_name,
      swimmer_name_2: r.swimmer_name_2,
      swimmer_name_3: r.swimmer_name_3,
      swimmer_name_4: r.swimmer_name_4,
      age_group: r.age_group,
      record_club: r.record_club,
      province: r.province,
      record_date: r.record_date,
      location: r.location,
      sort_order: idx,
      is_national: r.is_national,
      is_current_national: r.is_current_national,
      is_provincial: r.is_provincial,
      is_current_provincial: r.is_current_provincial,
      is_split: r.is_split,
      is_relay_split: r.is_relay_split,
      is_new: r.is_new,
    }))
  );

  if (recordsError) {
    return NextResponse.json(
      { error: `Records failed: ${recordsError.message}` },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    listId: listData.id,
    recordCount: records.length,
  });
}
