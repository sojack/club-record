import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

interface ClubLevelRequest {
  clubId: string;
  level: "regular" | "provincial" | "national";
  province: string | null;
}

export async function POST(request: NextRequest) {
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

  const body: ClubLevelRequest = await request.json();
  const { clubId, level, province } = body;

  if (!clubId || !["regular", "provincial", "national"].includes(level)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("clubs")
    .update({
      level,
      province: level === "provincial" ? (province?.trim() || null) : null,
    })
    .eq("id", clubId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
