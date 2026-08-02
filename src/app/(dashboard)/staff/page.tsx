import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { StaffManagement } from "@/components/staff/staff-management";
import type { Profile } from "@/lib/db.types";

export default async function StaffPage() {
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
  if (!p || p.role !== "admin" || !p.is_active) redirect("/pos");

  const { data: staff } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return <StaffManagement initialStaff={(staff as Profile[]) ?? []} currentUserId={user.id} />;
}
