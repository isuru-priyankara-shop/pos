import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { CustomerManager } from "@/components/customers/customer-manager";
import type { Customer } from "@/lib/db.types";

export default async function CustomersPage() {
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
  if (!p || !p.is_active) redirect("/login");

  const { data: customers } = await supabase.from("customers").select("*").order("name");

  return (
    <CustomerManager
      initialCustomers={(customers as Customer[]) ?? []}
      currentRole={p.role}
    />
  );
}
