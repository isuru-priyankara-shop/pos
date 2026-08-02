import { describe, expect, it } from "vitest";
import {
  round2,
  addMoney,
  mulMoney,
  lineTotal,
  computeTotals,
  formatCurrency,
  resolveDiscount,
} from "@/lib/money";

describe("money helpers", () => {
  it("rounds to 2dp", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(19.995)).toBe(20);
  });

  it("adds money without float drift", () => {
    expect(addMoney(19.99, 0.01)).toBe(20);
    expect(mulMoney(19.99, 3)).toBe(59.97);
  });

  it("computes line totals with discount", () => {
    expect(lineTotal(19.99, 2, 5)).toBe(34.98);
  });

  it("computes cart totals with tax and discounts", () => {
    const totals = computeTotals(
      [
        { unit_price: 19.99, quantity: 2, line_discount: 0, line_total: 39.98 },
        { unit_price: 49.99, quantity: 1, line_discount: 0, line_total: 49.99 },
      ],
      8,
      10
    );
    expect(totals.subtotal).toBe(89.97);
    expect(totals.discount_total).toBe(10);
    expect(totals.tax_total).toBe(round2(79.97 * 0.08));
    expect(totals.grand_total).toBe(round2(79.97 * 1.08));
  });

  it("tax cannot go negative with discounts above subtotal", () => {
    const totals = computeTotals([{ unit_price: 10, quantity: 1, line_discount: 15, line_total: -5 }], 10, 0);
    expect(totals.tax_total).toBe(0);
    expect(totals.grand_total).toBe(0);
  });

  it("formats currency in LKR", () => {
    expect(formatCurrency(19.995)).toBe("Rs 20.00");
  });

  it("resolveDiscount: fixed clamps to the base", () => {
    expect(resolveDiscount(1000, 250, "fixed")).toBe(250);
    expect(resolveDiscount(1000, 5000, "fixed")).toBe(1000);
    expect(resolveDiscount(1000, -5, "fixed")).toBe(0);
  });

  it("resolveDiscount: percent is a share of the base", () => {
    expect(resolveDiscount(2000, 10, "percent")).toBe(200);
    expect(resolveDiscount(333.33, 33.3, "percent")).toBe(111);
    expect(resolveDiscount(1000, 150, "percent")).toBe(1000);
    expect(resolveDiscount(1000, -10, "percent")).toBe(0);
  });
});
