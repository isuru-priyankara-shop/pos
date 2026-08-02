import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import type { Category } from "@/lib/db.types";
import type { ProductRow } from "@/lib/inventory";

export default async function InventoryPage() {
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

  const [{ data: products }, { data: categories }] = await Promise.all([
    supabase.from("products").select("*, category:categories(*), variants:product_variants(*)").order("name"),
    supabase.from("categories").select("*").order("name"),
  ]);

  return (
    <InventoryManager
      initialProducts={(products as unknown as ProductRow[]) ?? []}
      initialCategories={(categories as Category[]) ?? []}
    />
  );
}
