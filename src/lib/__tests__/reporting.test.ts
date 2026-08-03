import { describe, expect, it } from "vitest";
import {
  aggregateSales,
  bestSellers,
  dailyBreakdown,
  growthPct,
  paymentSplit,
  periodRange,
  slowMovers,
  type ReportItemRow,
  type ReportSaleRow,
  type ReportVariantRow,
} from "@/lib/reporting";

function sale(id: string, status: string, date: string): ReportSaleRow {
  return { id, status, sale_date: date };
}

function item(
  id: string,
  saleId: string,
  variantId: string,
  quantity: number,
  lineTotal: number,
  cost: number | null,
  productName = "Tee"
): ReportItemRow {
  return {
    id,
    sale_id: saleId,
    variant_id: variantId,
    quantity,
    unit_price: lineTotal / quantity,
    line_discount: 0,
    line_total: lineTotal,
    cost_price: cost,
    variant: {
      id: variantId,
      size: "M",
      color: null,
      product: { id: "p1", name: productName, sku_prefix: "TS" },
    },
  };
}

const sales: ReportSaleRow[] = [
  sale("s1", "completed", "2026-08-02T10:00:00+05:30"),
  sale("s2", "completed", "2026-08-02T11:00:00+05:30"),
  sale("s3", "void", "2026-08-02T12:00:00+05:30"),
];

const items: ReportItemRow[] = [
  item("i1", "s1", "v1", 2, 5000, 1500, "Tee"), // profit 2000
  item("i2", "s2", "v1", 1, 2500, 1500, "Tee"), // profit 1000
  item("i3", "s3", "v2", 3, 9000, 1000, "Jeans"), // voided — excluded
];

describe("aggregateSales", () => {
  it("totals only completed sales and excludes voids", () => {
    const t = aggregateSales(sales, items);
    expect(t.orders).toBe(2);
    expect(t.revenue).toBe(7500);
    expect(t.itemsSold).toBe(3);
    expect(t.voids).toBe(1);
    expect(t.profit).toBe(3000);
    expect(t.costedRevenue).toBe(7500);
    expect(t.marginPct).toBe(40);
  });

  it("returns null margin when no item has a cost", () => {
    const t = aggregateSales(sales, [item("i4", "s1", "v9", 1, 1000, null)]);
    expect(t.profit).toBe(0);
    expect(t.costedRevenue).toBe(0);
    expect(t.marginPct).toBeNull();
  });

  it("margins on the costed revenue share only", () => {
    const mixed = [item("i5", "s1", "v1", 1, 1000, null), item("i6", "s2", "v2", 1, 2000, 500)];
    const t = aggregateSales(sales, mixed);
    expect(t.profit).toBe(1500);
    expect(t.costedRevenue).toBe(2000);
    expect(t.marginPct).toBe(75);
  });
});

describe("bestSellers", () => {
  it("groups by variant and ranks by units sold", () => {
    const withJeans = [...items, item("i4", "s4", "v2", 1, 3000, 1000, "Jeans")];
    const ranked = bestSellers(withJeans, new Set(["s1", "s2", "s4"]), 10);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].variantId).toBe("v1");
    expect(ranked[0].units).toBe(3);
    expect(ranked[0].revenue).toBe(7500);
    expect(ranked[0].profit).toBe(3000);
    expect(ranked[1].variantId).toBe("v2");
  });

  it("honours the limit and ties break by revenue", () => {
    const more = [
      item("a", "s1", "x", 1, 100, 50, "A"),
      item("b", "s2", "y", 1, 900, 50, "B"),
      item("c", "s1", "z", 1, 800, 50, "C"),
    ];
    const ranked = bestSellers(more, new Set(["s1", "s2"]), 2);
    expect(ranked).toHaveLength(2);
    expect(ranked[0].variantId).toBe("y");
    expect(ranked[1].variantId).toBe("z");
  });

  it("shows null profit when cost is unknown", () => {
    const ranked = bestSellers([item("d", "s1", "v9", 1, 500, null)], new Set(["s1"]), 10);
    expect(ranked[0].profit).toBeNull();
  });
});

describe("slowMovers", () => {
  const variants: ReportVariantRow[] = [
    { id: "a", size: "M", color: null, stock_qty: 10, is_active: true, product: { id: "p", name: "A", sku_prefix: null } },
    { id: "b", size: "L", color: null, stock_qty: 5, is_active: true, product: { id: "p", name: "B", sku_prefix: null } },
    { id: "c", size: null, color: null, stock_qty: 3, is_active: true, product: { id: "p", name: "C", sku_prefix: null } },
    { id: "d", size: null, color: null, stock_qty: 8, is_active: false, product: { id: "p", name: "D", sku_prefix: null } },
  ];
  const soldItems = [item("i", "s1", "b", 1, 100, null)];

  it("lists active variants with stock but zero sales", () => {
    const movers = slowMovers(variants, soldItems, new Set(["s1"]));
    expect(movers.map((m) => m.variantId)).toEqual(["a", "c"]);
    expect(movers[0].stockQty).toBe(10);
    expect(movers[0].unitsSold).toBe(0);
  });

  it("excludes sold-out, disabled, and sold variants", () => {
    const movers = slowMovers(variants, soldItems, new Set(["s1"]));
    expect(movers.find((m) => m.variantId === "b")).toBeUndefined();
    expect(movers.find((m) => m.variantId === "d")).toBeUndefined();
  });

  it("sorts by stock quantity descending", () => {
    const movers = slowMovers(variants, soldItems, new Set(["s1"]));
    expect(movers[0].stockQty).toBeGreaterThanOrEqual(movers[1].stockQty);
  });
});

describe("paymentSplit", () => {
  it("only counts successful payments and keeps canonical order", () => {
    const split = paymentSplit([
      { method: "qr", amount: 500, status: "success" },
      { method: "cash", amount: 2000, status: "success" },
      { method: "card", amount: 1000, status: "failed" },
    ]);
    expect(split.map((s) => s.method)).toEqual(["cash", "qr"]);
    expect(split[0].amount).toBe(2000);
  });

  it("sums multiple payments of the same method", () => {
    const split = paymentSplit([
      { method: "cash", amount: 100, status: "success" },
      { method: "cash", amount: 50.5, status: "success" },
    ]);
    expect(split).toEqual([{ method: "cash", amount: 150.5 }]);
  });
});

describe("periodRange", () => {
  const now = new Date(2026, 7, 2, 15, 0, 0); // Aug 2, 2026 15:00 local

  it("today spans the whole local day", () => {
    const { from, to } = periodRange("today", now);
    expect(from.getHours()).toBe(0);
    expect(to.getDate()).toBe(3);
    expect(from.getDate()).toBe(2);
  });

  it("7d covers the last seven days including today", () => {
    const { from, to } = periodRange("7d", now);
    expect(from.getDate()).toBe(27); // Jul 27
    expect(to.getDate()).toBe(3);
  });

  it("month spans the current month", () => {
    const { from, to } = periodRange("month", now);
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(7);
    expect(to.getMonth()).toBe(8);
    expect(to.getDate()).toBe(1);
  });

  it("lastMonth spans the previous month", () => {
    const { from, to } = periodRange("lastMonth", now);
    expect(from.getMonth()).toBe(6);
    expect(to.getMonth()).toBe(7);
    expect(to.getDate()).toBe(1);
  });
});

describe("dailyBreakdown", () => {
  it("buckets revenue and orders per day over the window", () => {
    const now = new Date(2026, 7, 2, 12, 0, 0);
    const salesIn = [
      sale("x1", "completed", "2026-08-01T10:00:00+05:30"),
      sale("x2", "completed", "2026-08-01T11:00:00+05:30"),
      sale("x3", "completed", "2026-08-02T09:00:00+05:30"),
      sale("x4", "void", "2026-08-02T09:30:00+05:30"),
    ];
    const itemsIn = [
      item("m1", "x1", "v1", 1, 1000, null),
      item("m2", "x2", "v1", 1, 2000, null),
      item("m3", "x3", "v1", 1, 4000, null),
      item("m4", "x4", "v1", 1, 9999, null), // voided
    ];
    const rows = dailyBreakdown(salesIn, itemsIn, 3, now);
    expect(rows).toHaveLength(3);
    const day1 = rows[rows.length - 2];
    const day2 = rows[rows.length - 1];
    expect(day1.date).toBe("2026-08-01");
    expect(day1.revenue).toBe(3000);
    expect(day1.orders).toBe(2);
    expect(day2.date).toBe("2026-08-02");
    expect(day2.revenue).toBe(4000);
    expect(day2.orders).toBe(1);
  });
});

describe("growthPct", () => {
  it("measures growth between the two halves of a daily series", () => {
    const rows = [
      { date: "a", label: "a", revenue: 100, orders: 1 },
      { date: "b", label: "b", revenue: 100, orders: 1 },
      { date: "c", label: "c", revenue: 150, orders: 2 },
      { date: "d", label: "d", revenue: 150, orders: 2 },
    ];
    expect(growthPct(rows)).toBe(50);
  });

  it("reports a decline as a negative percentage", () => {
    const rows = [
      { date: "a", label: "a", revenue: 200, orders: 2 },
      { date: "b", label: "b", revenue: 200, orders: 2 },
      { date: "c", label: "c", revenue: 100, orders: 1 },
      { date: "d", label: "d", revenue: 100, orders: 1 },
    ];
    expect(growthPct(rows)).toBe(-50);
  });

  it("returns null when there is no baseline revenue and nothing recent", () => {
    const rows = [
      { date: "a", label: "a", revenue: 0, orders: 0 },
      { date: "b", label: "b", revenue: 0, orders: 0 },
      { date: "c", label: "c", revenue: 0, orders: 0 },
      { date: "d", label: "d", revenue: 0, orders: 0 },
    ];
    expect(growthPct(rows)).toBeNull();
    expect(growthPct([])).toBeNull();
    expect(growthPct([rows[0]])).toBeNull();
  });

  it("returns 100 when starting from no prior revenue", () => {
    const rows = [
      { date: "a", label: "a", revenue: 0, orders: 0 },
      { date: "b", label: "b", revenue: 0, orders: 0 },
      { date: "c", label: "c", revenue: 50, orders: 1 },
      { date: "d", label: "d", revenue: 50, orders: 1 },
    ];
    expect(growthPct(rows)).toBe(100);
  });
});
