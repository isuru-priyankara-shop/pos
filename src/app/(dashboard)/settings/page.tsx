import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { SettingsPanel } from "@/components/settings/settings-panel";

export default async function SettingsPage() {
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

  return <SettingsPanel />;
}
