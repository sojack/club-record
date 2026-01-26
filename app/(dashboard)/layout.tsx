import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    <DashboardShell clubs={clubs}>
      {children}
    </DashboardShell>
  );
}
