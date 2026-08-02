import { describe, expect, it } from "vitest";
import { hasRole, isAtLeast, canManageCatalog, canVoidSales, canManageProfiles } from "@/lib/auth";
import type { Profile } from "@/lib/db.types";

function makeProfile(role: Profile["role"], isActive = true): Profile {
  return {
    id: "u1",
    full_name: "Test",
    email: null,
    role,
    is_active: isActive,
    created_at: new Date().toISOString(),
  };
}

describe("role gating", () => {
  it("rejects null/inactive profiles", () => {
    expect(hasRole(null, ["cashier"])).toBe(false);
    expect(hasRole(makeProfile("cashier", false), ["cashier"])).toBe(false);
  });

  it("cashier can sell but cannot manage catalog or void", () => {
    const cashier = makeProfile("cashier");
    expect(hasRole(cashier, ["cashier"])).toBe(true);
    expect(canManageCatalog(cashier)).toBe(false);
    expect(canVoidSales(cashier)).toBe(false);
    expect(canManageProfiles(cashier)).toBe(false);
  });

  it("manager inherits catalog and void but not profile management", () => {
    const manager = makeProfile("manager");
    expect(canManageCatalog(manager)).toBe(true);
    expect(canVoidSales(manager)).toBe(true);
    expect(canManageProfiles(manager)).toBe(false);
  });

  it("admin inherits everything", () => {
    const admin = makeProfile("admin");
    expect(canManageCatalog(admin)).toBe(true);
    expect(canVoidSales(admin)).toBe(true);
    expect(canManageProfiles(admin)).toBe(true);
    expect(isAtLeast(admin, "cashier")).toBe(true);
  });

  it("role rank ordering", () => {
    expect(isAtLeast(makeProfile("manager"), "cashier")).toBe(true);
    expect(isAtLeast(makeProfile("cashier"), "manager")).toBe(false);
    expect(isAtLeast(makeProfile("admin"), "admin")).toBe(true);
  });
});
