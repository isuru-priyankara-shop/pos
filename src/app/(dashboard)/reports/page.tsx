import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { ReportsManager } from "@/components/reports/reports-manager";

export default async function ReportsPage() {
  const supabase = await createServerClient_();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();
  const p = profile as { role: string; is_active: boolean } | null;
  if (!p || (p.role !== "admin" && p.role !== "manager") || !p.is_active) redirect("/pos");

  return <ReportsManager />;
}
