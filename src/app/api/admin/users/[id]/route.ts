import { NextResponse } from "next/server";
import { requireAdmin, createAdminClient, VALID_ROLES } from "@/lib/api-auth";
import type { Role } from "@/lib/db.types";

interface PatchBody {
  full_name?: string;
  role?: Role;
  is_active?: boolean;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (!guard) {
    return NextResponse.json({ error: "Unauthorized — admin only" }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing user id" }, { status: 400 });

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates: { full_name?: string; role?: Role; is_active?: boolean } = {};
  if (body.full_name !== undefined) {
    const name = body.full_name.trim();
    if (!name) return NextResponse.json({ error: "Full name cannot be empty" }, { status: 400 });
    updates.full_name = name;
  }
  if (body.role !== undefined) {
    if (!VALID_ROLES.includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }
    updates.role = body.role;
  }
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  // Never allow an admin to demote or deactivate themselves.
  if (id === guard.user.id && (updates.role === "cashier" || updates.role === "manager" || updates.is_active === false)) {
    return NextResponse.json(
      { error: "You cannot demote or deactivate your own account" },
      { status: 400 }
    );
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

  const { error } = await admin.from("profiles").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
