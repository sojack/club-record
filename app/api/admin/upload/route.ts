import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface RecordData {
  event_name: string;
  time_ms: number;
  swimmer_name: string;
  record_date: string | null;
  location: string | null;
  sort_order: number;
  is_national: boolean;
  is_current_national: boolean;
  is_provincial: boolean;
  is_current_provincial: boolean;
  is_split: boolean;
  is_relay_split: boolean;
  is_new: boolean;
}

interface UploadRequest {
  clubId: string;
  title: string;
  slug: string;
  courseType: "LCM" | "SCM" | "SCY";
  records: RecordData[];
}

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

  // Parse request body
  const body: UploadRequest = await request.json();
  const { clubId, title, slug, courseType, records } = body;

  if (!clubId || !title || !slug || !records) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Use admin client to bypass RLS
  const adminClient = createAdminClient();

  // Create record list
  const { data: listData, error: listError } = await adminClient
    .from("record_lists")
    .insert({
      club_id: clubId,
      title,
      slug,
      course_type: courseType,
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
