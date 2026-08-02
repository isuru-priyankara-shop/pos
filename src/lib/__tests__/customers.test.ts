import { describe, expect, it } from "vitest";
import type { Customer } from "@/lib/db.types";
import { searchCustomers, sortCustomersByName, validateCustomerForm } from "@/lib/customers";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: crypto.randomUUID(),
    name: "Test Customer",
    phone: null,
    email: null,
    loyalty_points: 0,
    credit_balance: 0,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

describe("validateCustomerForm", () => {
  it("requires a name", () => {
    expect(validateCustomerForm({ name: "  ", phone: "", email: "" }).name).toBeDefined();
  });

  it("accepts a valid form", () => {
    expect(validateCustomerForm({ name: "Nimal", phone: "0771234567", email: "n@example.com" })).toEqual({});
  });

  it("rejects malformed phone and email", () => {
    const errors = validateCustomerForm({ name: "Nimal", phone: "abc", email: "nope" });
    expect(errors.phone).toBeDefined();
    expect(errors.email).toBeDefined();
  });

  it("allows empty optional phone/email", () => {
    expect(validateCustomerForm({ name: "Nimal", phone: "", email: "" })).toEqual({});
  });
});

describe("searchCustomers", () => {
  const list = [
    customer({ id: "a", name: "Nimal Perera", phone: "0771111111", email: null }),
    customer({ id: "b", name: "Sunil", phone: null, email: "sunil@shop.lk" }),
    customer({ id: "c", name: "Kamal", phone: "0112223333", email: null }),
  ];

  it("returns everything on an empty query", () => {
    expect(searchCustomers(list, "")).toHaveLength(3);
    expect(searchCustomers(list, "   ")).toHaveLength(3);
  });

  it("matches by name case-insensitively", () => {
    expect(searchCustomers(list, "nimal")).toHaveLength(1);
    expect(searchCustomers(list, "NIMAL")).toHaveLength(1);
  });

  it("matches by phone and email", () => {
    expect(searchCustomers(list, "0771111111")).toHaveLength(1);
    expect(searchCustomers(list, "sunil@shop.lk")).toHaveLength(1);
  });
});

describe("sortCustomersByName", () => {
  it("sorts alphabetically without mutating the input", () => {
    const list = [customer({ name: "b" }), customer({ name: "a" }), customer({ name: "c" })];
    const sorted = sortCustomersByName(list);
    expect(sorted.map((c) => c.name)).toEqual(["a", "b", "c"]);
    expect(list[0].name).toBe("b");
  });
});
