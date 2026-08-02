import { redirect } from "next/navigation";
import { createServerClient_ } from "@/lib/supabase/server";
import { SalesHistory } from "@/components/sales/sales-history";

export default async function SalesPage() {
  const supabase = await createServerClient_();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS: cashier sees own sales; manager/admin see all
  const { data: sales } = await supabase
    .from("sales")
    .select(
      "*, items:sale_items(*, variant:product_variants(*, product:products(name))), payments(*), customer:customers(name, phone), cashier:profiles(full_name)"
    )
    .order("sale_date", { ascending: false })
    .limit(200);

  return <SalesHistory initialSales={(sales ?? []) as never} />;
}
