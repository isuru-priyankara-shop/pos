import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient_ } from "./supabase/server";
import type { Role } from "./db.types";

export const VALID_ROLES: Role[] = ["admin", "manager", "cashier"];

/**
 * Verifies the calling user is a logged-in, active admin using their
 * own session (RLS-verified). Returns null otherwise.
 */
export async function requireAdmin(): Promise<{
  supabase: SupabaseClient;
  user: User;
} | null> {
  const supabase = await createServerClient_();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const p = profile as { role: string; is_active: boolean } | null;
  if (!p || p.role !== "admin" || !p.is_active) return null;

  return { supabase, user };
}

/**
 * Service-role client. ONLY used inside Route Handlers / server code.
 * Never import this into a client component.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (Project Settings -> API -> service_role key)."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
