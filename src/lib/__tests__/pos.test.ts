import { describe, expect, it } from "vitest";
import { computePaymentSummary, buildSalePayload, type CartLine } from "@/lib/pos";

function line(variantId: string, price: number, quantity: number, lineDiscount = 0): CartLine {
  return {
    variant: {
      id: variantId,
      product_id: "p1",
      product_name: "Tee",
      size: "M",
      color: "White",
      barcode: `BC${variantId}`,
      price,
      cost_price: 1,
      stock_qty: 10,
      reorder_level: 2,
      is_active: true,
      created_at: "",
    },
    quantity,
    line_discount: lineDiscount,
  };
}

describe("computePaymentSummary", () => {
  it("cash exact payment: no change, no shortfall", () => {
    const s = computePaymentSummary([{ id: "1", method: "cash", amount: 100 }], 100);
    expect(s).toMatchObject({ cashSum: 100, change: 0, shortfall: 0, totalPaid: 100 });
  });

  it("cash overpayment produces change", () => {
    const s = computePaymentSummary([{ id: "1", method: "cash", amount: 2000 }], 1750.5);
    expect(s.change).toBe(249.5);
  });

  it("split cash+card: change only from excess cash", () => {
    const s = computePaymentSummary(
      [
        { id: "1", method: "cash", amount: 1000 },
        { id: "2", method: "card", amount: 750 },
      ],
      1750
    );
    expect(s.change).toBe(0);
    expect(s.shortfall).toBe(0);
    expect(s.totalPaid).toBe(1750);
  });

  it("underpayment shows shortfall and no change", () => {
    const s = computePaymentSummary([{ id: "1", method: "cash", amount: 500 }], 750);
    expect(s.shortfall).toBe(250);
    expect(s.change).toBe(0);
  });
});

describe("buildSalePayload", () => {
  it("computes totals and generates ids", () => {
    const payload = buildSalePayload(
      [line("v1", 1000, 2), line("v2", 500, 1, 50)],
      null,
      "cashier-1",
      10,
      [{ id: "pay1", method: "cash", amount: 2600 }]
    );

    expect(payload.sale.subtotal).toBe(2500);
    expect(payload.sale.discount_total).toBe(50);
    expect(payload.sale.tax_total).toBe(245);
    expect(payload.sale.grand_total).toBe(2695);
    expect(payload.sale.cashier_id).toBe("cashier-1");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].line_total).toBe(2000);
    expect(payload.payments[0]).toMatchObject({ method: "cash", amount: 2600, status: "success" });
    expect(payload.sale.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
