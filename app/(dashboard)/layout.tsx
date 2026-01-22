import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Club } from "@/types/database";
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

  const { data: clubs } = await supabase
    .from("clubs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <DashboardShell clubs={(clubs as Club[]) || []}>
      {children}
    </DashboardShell>
  );
}
