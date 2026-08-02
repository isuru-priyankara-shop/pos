import type { Role } from "./db.types";

/**
 * Server-side rule: manager/admin may void anything; a cashier may void
 * their own sale only when the amount is at or below the threshold.
 */
export function needsManagerApproval(
  role: Role | null | undefined,
  saleAmount: number,
  threshold: number
): boolean {
  if (role === "admin" || role === "manager") return false;
  // unknown/missing role fails closed like a cashier
  return saleAmount > threshold;
}
