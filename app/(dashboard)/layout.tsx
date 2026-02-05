import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClubWithMembership, Club, ClubMemberRole } from "@/types/database";
import DashboardShell from "@/components/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check if user is admin
  const isAdmin = user.email === process.env.ADMIN_EMAIL;

  // If admin, auto-ensure owner membership for all clubs
  if (isAdmin) {
    const adminClient = createAdminClient();

    // Fetch all clubs
    const { data: allClubs } = await adminClient.from("clubs").select("id");

    if (allClubs && allClubs.length > 0) {
      // Upsert owner membership for admin in all clubs
      const membershipsToUpsert = allClubs.map((club) => ({
        club_id: club.id,
        user_id: user.id,
        role: "owner" as ClubMemberRole,
      }));

      await adminClient
        .from("club_members")
        .upsert(membershipsToUpsert, { onConflict: "club_id,user_id" });
    }
  }

  // Query clubs through club_members to get role info
  const { data: memberships } = await supabase
    .from("club_members")
    .select("role, clubs(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  // Transform to ClubWithMembership[]
  const clubs: ClubWithMembership[] = (memberships || [])
    .filter((m) => m.clubs) // Filter out any null clubs
    .map((m) => {
      const club = m.clubs as unknown as Club;
      return {
        ...club,
        membership: { role: m.role as ClubMemberRole },
      };
    });

  return (
    <DashboardShell clubs={clubs} isAdmin={isAdmin}>
      {children}
    </DashboardShell>
  );
}
