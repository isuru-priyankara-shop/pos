import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { AuthProvider } from "@/components/auth-provider";
import { AppNav } from "@/components/app-nav";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createServerClient_();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !(profile as { is_active: boolean }).is_active) {
    await supabase.auth.signOut();
    redirect("/login?inactive=1");
  }

  return (
    <AuthProvider>
      <div className="flex min-h-screen flex-col">
        <AppNav profile={profile} />
        <main className="flex-1">{children}</main>
      </div>
    </AuthProvider>
  );
}
