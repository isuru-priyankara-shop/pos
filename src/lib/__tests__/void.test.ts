import { describe, expect, it } from "vitest";
import { needsManagerApproval } from "@/lib/void";

describe("void approval gate", () => {
  const THRESHOLD = 1000;

  it("manager/admin never need approval", () => {
    expect(needsManagerApproval("manager", 99999, THRESHOLD)).toBe(false);
    expect(needsManagerApproval("admin", 99999, THRESHOLD)).toBe(false);
  });

  it("cashier needs approval above threshold only", () => {
    expect(needsManagerApproval("cashier", 1000.01, THRESHOLD)).toBe(true);
    expect(needsManagerApproval("cashier", 1000, THRESHOLD)).toBe(false);
    expect(needsManagerApproval("cashier", 0, THRESHOLD)).toBe(false);
  });

  it("missing/inactive role treated as cashier", () => {
    expect(needsManagerApproval(null, 5000, THRESHOLD)).toBe(true);
    expect(needsManagerApproval(undefined, 5000, THRESHOLD)).toBe(true);
  });
});
