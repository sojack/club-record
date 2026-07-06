import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { isBotUserAgent, utcDay } from "@/lib/analytics";
import { trackSchema } from "./schema";

function noContent() {
  return new NextResponse(null, { status: 204 });
}

// Fire-and-forget page-view tracking. This route must never surface an
// error to visitors: every outcome (bad input, bot, DB failure) is a 204.
export async function POST(request: NextRequest) {
  try {
    const ua = request.headers.get("user-agent");
    if (isBotUserAgent(ua)) return noContent();

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return noContent();
    }
    const parsed = trackSchema.safeParse(raw);
    if (!parsed.success) return noContent();
    const { path, clubSlug, listSlug, referrer } = parsed.data;

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    const salt = process.env.TRACKING_SALT ?? "club-record-tracking";
    const visitorHash = createHash("sha256")
      .update(`${ip}|${ua}|${utcDay(new Date())}|${salt}`)
      .digest("hex");

    const admin = createAdminClient();
    const { data: club } = await admin
      .from("clubs")
      .select("id")
      .eq("slug", clubSlug)
      .maybeSingle();

    await admin.from("page_views").insert({
      club_id: (club as { id: string } | null)?.id ?? null,
      club_slug: clubSlug,
      list_slug: listSlug ?? null,
      path,
      referrer: referrer || null,
      visitor_hash: visitorHash,
    });
  } catch (e) {
    console.error("[track] page-view insert failed", e);
  }
  return noContent();
}
