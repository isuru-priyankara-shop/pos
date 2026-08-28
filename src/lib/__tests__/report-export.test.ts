import { describe, expect, it } from "vitest";
import {
  rangeForMode,
  refFromInput,
  reportFilename,
  summarizeSales,
  type ReportSaleExportRow,
} from "@/lib/report-export";

function sale(partial: Partial<ReportSaleExportRow>): ReportSaleExportRow {
  return {
    id: "sale-1",
    sale_date: "2026-08-21T10:00:00.000Z",
    subtotal: 0,
    discount_total: 0,
    tax_total: 0,
    grand_total: 0,
    status: "completed",
    items: [],
    payments: [],
    customer: null,
    cashier: null,
    ...partial,
  };
}

describe("refFromInput", () => {
  it("parses day inputs", () => {
    const ref = refFromInput("day", "2026-08-21");
    expect(ref).not.toBeNull();
    expect(ref!.getFullYear()).toBe(2026);
    expect(ref!.getMonth()).toBe(7);
    expect(ref!.getDate()).toBe(21);
  });

  it("parses month and year inputs", () => {
    expect(refFromInput("month", "2026-02")!.getMonth()).toBe(1);
    expect(refFromInput("year", "2025")!.getFullYear()).toBe(2025);
  });

  it("rejects malformed input", () => {
    expect(refFromInput("day", "21/08/2026")).toBeNull();
    expect(refFromInput("month", "2026-13")).toBeNull();
    expect(refFromInput("year", "abc")).toBeNull();
  });
});

describe("rangeForMode", () => {
  it("day range covers exactly one day", () => {
    const { from, to } = rangeForMode("day", new Date(2026, 7, 21));
    expect(from.getHours() + from.getMinutes()).toBe(0);
    expect(to.getTime() - from.getTime()).toBe(86400000);
  });

  it("month range spans the calendar month", () => {
    const { from, to } = rangeForMode("month", new Date(2026, 1, 14));
    expect(from.getDate()).toBe(1);
    expect(to.getMonth()).toBe(2);
    expect(to.getDate()).toBe(1);
  });

  it("year range spans Jan 1 to next Jan 1", () => {
    const { from, to } = rangeForMode("year", new Date(2026, 5, 3));
    expect(from.getMonth()).toBe(0);
    expect(to.getFullYear()).toBe(2027);
  });
});

describe("summarizeSales", () => {
  it("aggregates completed sales only and splits payments", () => {
    const sales = [
      sale({
        id: "a",
        subtotal: 100,
        discount_total: 10,
        tax_total: 14,
        grand_total: 104,
        items: [{ quantity: 2, line_total: 100 }],
        payments: [{ method: "cash", amount: 104, status: "success" }],
      }),
      sale({
        id: "b",
        grand_total: 50,
        subtotal: 50,
        status: "void",
        items: [{ quantity: 1, line_total: 50 }],
      }),
      sale({
        id: "c",
        grand_total: 200,
        subtotal: 200,
        items: [{ quantity: 1, line_total: 200 }],
        payments: [{ method: "card", amount: 200, status: "success" }],
      }),
    ];
    const s = summarizeSales(sales);
    expect(s.orders).toBe(2);
    expect(s.voided).toBe(1);
    expect(s.itemsSold).toBe(3);
    expect(s.revenue).toBe(304);
    expect(s.discounts).toBe(10);
    expect(s.payments).toEqual([
      { method: "cash", amount: 104 },
      { method: "card", amount: 200 },
    ]);
  });
});

describe("reportFilename", () => {
  it("encodes the period in the file name", () => {
    expect(reportFilename("day", new Date(2026, 7, 9))).toBe("sales-report-2026-08-09.xlsx");
    expect(reportFilename("month", new Date(2026, 7, 9))).toBe("sales-report-2026-08.xlsx");
    expect(reportFilename("year", new Date(2026, 7, 9))).toBe("sales-report-2026.xlsx");
  });
});
