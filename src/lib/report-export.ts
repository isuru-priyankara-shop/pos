import * as XLSX from "xlsx";
import type { Payment } from "./db.types";
import { round2 } from "./money";

// Pure sales-report helpers: period math + workbook building for the
// day / month / year downloads in the Sales section.

export type ReportMode = "day" | "month" | "year";

export interface DateRange {
  from: Date;
  to: Date; // exclusive
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Local-timezone range for the chosen mode; end is exclusive. */
export function rangeForMode(mode: ReportMode, ref: Date): DateRange {
  const y = ref.getFullYear();
  switch (mode) {
    case "day":
      return { from: new Date(y, ref.getMonth(), ref.getDate()), to: new Date(y, ref.getMonth(), ref.getDate() + 1) };
    case "month":
      return { from: new Date(y, ref.getMonth(), 1), to: new Date(y, ref.getMonth() + 1, 1) };
    case "year":
      return { from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) };
  }
}

/** Parse the raw values collected from the download dialog. */
export function refFromInput(mode: ReportMode, value: string): Date | null {
  if (mode === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [y, m, d] = value.split("-").map(Number);
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const ref = new Date(y, m - 1, d);
    return ref.getDate() === d && ref.getMonth() === m - 1 ? ref : null; // rejects e.g. Feb 30
  }
  if (mode === "month") {
    if (!/^\d{4}-\d{2}$/.test(value)) return null;
    const [y, m] = value.split("-").map(Number);
    if (m < 1 || m > 12) return null;
    return new Date(y, m - 1, 1);
  }
  if (!/^\d{4}$/.test(value)) return null;
  const y = Number(value);
  if (y < 1970 || y > 2200) return null;
  return new Date(y, 0, 1);
}

// ------------------------------------------------------------------
// Input rows (same shape the Sales page fetches)
// ------------------------------------------------------------------

export interface ReportSaleItemRow {
  quantity: number;
  line_total: number;
}

export interface ReportSaleExportRow {
  id: string;
  sale_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  status: string;
  items: ReportSaleItemRow[];
  payments: Pick<Payment, "method" | "amount" | "status">[];
  customer: { name: string } | null;
  cashier: { full_name: string } | null;
}

// ------------------------------------------------------------------
// Aggregation
// ------------------------------------------------------------------

export interface SalesReportSummary {
  orders: number;
  voided: number;
  refunded: number;
  itemsSold: number;
  subtotal: number;
  discounts: number;
  tax: number;
  revenue: number;
  payments: { method: string; amount: number }[];
}

export function summarizeSales(sales: ReportSaleExportRow[]): SalesReportSummary {
  const completed = sales.filter((s) => s.status === "completed");
  const totals = new Map<string, number>();
  let itemsSold = 0;
  let subtotal = 0;
  let discounts = 0;
  let tax = 0;
  let revenue = 0;
  for (const s of completed) {
    subtotal = round2(subtotal + s.subtotal);
    discounts = round2(discounts + s.discount_total);
    tax = round2(tax + s.tax_total);
    revenue = round2(revenue + s.grand_total);
    itemsSold += s.items.reduce((a, i) => a + i.quantity, 0);
    for (const p of s.payments) {
      if (p.status !== "success") continue;
      totals.set(p.method, round2((totals.get(p.method) ?? 0) + p.amount));
    }
  }
  return {
    orders: completed.length,
    voided: sales.filter((s) => s.status === "void").length,
    refunded: sales.filter((s) => s.status === "refunded").length,
    itemsSold,
    subtotal,
    discounts,
    tax,
    revenue,
    payments: [...totals.entries()].map(([method, amount]) => ({ method, amount })),
  };
}

// ------------------------------------------------------------------
// Workbook
// ------------------------------------------------------------------

function labelForRange(mode: ReportMode, ref: Date): string {
  if (mode === "day") return ref.toLocaleDateString("en-LK", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  if (mode === "month") return ref.toLocaleDateString("en-LK", { year: "numeric", month: "long" });
  return String(ref.getFullYear());
}

export function reportFilename(mode: ReportMode, ref: Date): string {
  if (mode === "day") return `sales-report-${dateKey(ref)}.xlsx`;
  if (mode === "month") return `sales-report-${monthKey(ref)}.xlsx`;
  return `sales-report-${ref.getFullYear()}.xlsx`;
}

export function buildSalesWorkbook(
  sales: ReportSaleExportRow[],
  mode: ReportMode,
  ref: Date
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const summary = summarizeSales(sales);

  const summaryAoa: (string | number)[][] = [
    ["Sales report"],
    ["Period", labelForRange(mode, ref)],
    ["Generated", new Date().toLocaleString("en-LK")],
    [],
    ["Metric", "Value"],
    ["Orders", summary.orders],
    ["Items sold", summary.itemsSold],
    ["Subtotal", summary.subtotal],
    ["Discounts", summary.discounts],
    ["Tax", summary.tax],
    ["Revenue", summary.revenue],
    ["Voided", summary.voided],
    ["Refunded", summary.refunded],
    [],
    ["Payments", ""],
    ...summary.payments.map((p) => [p.method, p.amount]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoa), "Summary");

  const salesRows = sales.map((s) => ({
    Date: new Date(s.sale_date).toLocaleString("en-LK"),
    Receipt: s.id.slice(0, 8).toUpperCase(),
    Cashier: s.cashier?.full_name ?? "",
    Customer: s.customer?.name ?? "Walk-in",
    Items: s.items.reduce((a, i) => a + i.quantity, 0),
    Subtotal: s.subtotal,
    Discount: s.discount_total,
    Tax: s.tax_total,
    Total: s.grand_total,
    Payments: s.payments.map((p) => `${p.method} ${p.amount}`).join(", "),
    Status: s.status,
  }));
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(salesRows.length ? salesRows : [{ Date: "No sales in this period" }]),
    "Sales"
  );

  return wb;
}

export function downloadSalesReport(
  sales: ReportSaleExportRow[],
  mode: ReportMode,
  ref: Date
): string {
  XLSX.writeFile(buildSalesWorkbook(sales, mode, ref), reportFilename(mode, ref));
  return reportFilename(mode, ref);
}
