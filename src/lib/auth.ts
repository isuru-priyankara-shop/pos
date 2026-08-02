import type { Profile, Role } from "./db.types";

export const ROLE_RANK: Record<Role, number> = {
  cashier: 1,
  manager: 2,
  admin: 3,
};

export function hasRole(profile: Profile | null | undefined, roles: Role[]): boolean {
  if (!profile || !profile.is_active) return false;
  return roles.includes(profile.role);
}

export function isAtLeast(profile: Profile | null | undefined, role: Role): boolean {
  if (!profile || !profile.is_active) return false;
  return ROLE_RANK[profile.role] >= ROLE_RANK[role];
}

export const canManageCatalog = (p?: Profile | null) => isAtLeast(p, "manager");
export const canManageProfiles = (p?: Profile | null) => isAtLeast(p, "admin");
export const canVoidSales = (p?: Profile | null) => isAtLeast(p, "manager");
export const canAccessReporting = (p?: Profile | null) => isAtLeast(p, "manager");
export const canInsertInventoryTransactions = (p?: Profile | null) => isAtLeast(p, "manager");
