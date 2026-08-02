import { NextResponse } from "next/server";
import { requireAdmin, createAdminClient, VALID_ROLES } from "@/lib/api-auth";
import type { Role } from "@/lib/db.types";

interface CreateUserBody {
  full_name: string;
  email: string;
  password: string;
  role: Role;
  is_active: boolean;
}

export async function GET() {
  const guard = await requireAdmin();
  if (!guard) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }
  const { data, error } = await guard.supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ staff: data });
}

export async function POST(request: Request) {
  const guard = await requireAdmin();
  if (!guard) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  let body: CreateUserBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fullName = (body.full_name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role: Role = body.role ?? "cashier";
  const isActive = body.is_active !== false;

  if (!fullName) return NextResponse.json({ error: "Full name is required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
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

  // 1) Create the auth account (password hashed by Supabase Auth).
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createErr) {
    return NextResponse.json({ error: createErr.message }, { status: 400 });
  }
  const userId = created.user.id;

  // 2) The signup trigger created a profile (cashier/inactive);
  //    promote it to the chosen role + active state.
  const { error: profileErr } = await admin
    .from("profiles")
    .update({ role, is_active: isActive, full_name: fullName, email })
    .eq("id", userId);
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ user: { id: userId, email } }, { status: 201 });
}
