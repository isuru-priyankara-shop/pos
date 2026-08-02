import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient_ } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/api-auth";
import { needsManagerApproval } from "@/lib/void";

interface VoidBody {
  status?: "void" | "refunded";
  reason?: string;
  manager_email?: string;
  manager_password?: string;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient_();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // The caller's own RLS client only returns their own sales, so a cashier
  // can never reach another cashier's sale this way.
  const { data: sale, error: saleErr } = await supabase
    .from("sales")
    .select("grand_total, status")
    .eq("id", id)
    .maybeSingle();
  if (saleErr || !sale) {
    return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  }
  if (sale.status !== "completed") {
    return NextResponse.json({ error: `Sale is already ${sale.status}` }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role: string } | null)?.role;

  const body = (await request.json().catch(() => ({}))) as VoidBody;
  const status = body.status === "refunded" ? "refunded" : "void";
  const reason = typeof body.reason === "string" ? body.reason.slice(0, 200) : null;

  // Server-side approval gate: cashier above the threshold needs manager creds
  const { data: settings } = await supabase.from("app_settings").select("key, value");
  const threshold =
    parseFloat(settings?.find((s) => (s as { key: string }).key === "void_threshold" && (s as { value: string }).value)?.value ?? "0") || 0;

  if (needsManagerApproval(role as "admin" | "manager" | "cashier" | null | undefined, sale.grand_total, threshold)) {
    const email = (body.manager_email ?? "").trim().toLowerCase();
    const password = body.manager_password ?? "";
    if (!email || !password) {
      return NextResponse.json(
        { error: "Manager approval required — a manager must enter their credentials" },
        { status: 400 }
      );
    }

    // Throwaway client: validates manager credentials without touching the
    // cashier's session cookies.
    const temp = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
    const { data: mgr, error: authErr } = await temp.auth.signInWithPassword({ email, password });
    if (authErr || !mgr.user) {
      return NextResponse.json({ error: "Invalid manager credentials" }, { status: 401 });
    }
    const { data: mgrProfile } = await temp
      .from("profiles")
      .select("role, is_active")
      .eq("id", mgr.user.id)
      .maybeSingle();
    const mp = mgrProfile as { role: string; is_active: boolean } | null;
    if (!mp || !mp.is_active || !["admin", "manager"].includes(mp.role)) {
      return NextResponse.json(
        { error: "This account does not have manager authority" },
        { status: 403 }
      );
    }
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Server misconfigured" },
      { status: 500 }
    );
  }

  const { data, error } = await admin.rpc("void_sale", {
    p_sale_id: id,
    p_status: status,
    p_reason: reason,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...(data as object) });
}
