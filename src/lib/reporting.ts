import type { PaymentMethod } from "./db.types";
import { round2 } from "./money";

// Pure reporting math. All functions operate on plain, serializable
// shapes so they are unit-testable without a database.

export type ReportPeriod = "today" | "7d" | "month" | "lastMonth" | "custom";

export interface DateRange {
  from: Date;
  to: Date; // exclusive
}

/** Local-timezone ranges, exclusive end. */
export function periodRange(period: ReportPeriod, now = new Date()): DateRange {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  switch (period) {
    case "today":
      return { from: new Date(y, m, d), to: new Date(y, m, d + 1) };
    case "7d":
      return { from: new Date(y, m, d - 6), to: new Date(y, m, d + 1) };
    case "month":
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 1) };
    case "lastMonth":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 1) };
    case "custom":
      return { from: now, to: new Date(now.getTime() + 86400000) };
  }
}

export function periodRangeISO(period: ReportPeriod, now = new Date()): { fromISO: string; toISO: string } {
  const { from, to } = periodRange(period, now);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

// ------------------------------------------------------------------
// Input rows (the shapes the UI fetches from Supabase)
// ------------------------------------------------------------------

export interface ReportSaleRow {
  id: string;
  status: string;
  sale_date: string;
}

export interface ReportItemRow {
  id: string;
  sale_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
  cost_price: number | null;
  variant: {
    id: string;
    size: string | null;
    color: string | null;
    product: { id: string; name: string; sku_prefix: string | null } | null;
  } | null;
}

export interface ReportPaymentRow {
  method: PaymentMethod;
  amount: number;
  status: string;
}

export interface ReportVariantRow {
  id: string;
  size: string | null;
  color: string | null;
  stock_qty: number;
  is_active: boolean;
  product: { id: string; name: string; sku_prefix: string | null } | null;
}

// ------------------------------------------------------------------
// Aggregation
// ------------------------------------------------------------------

export interface SaleTotals {
  orders: number;
  revenue: number; // sum of line_totals, completed sales only
  itemsSold: number;
  profit: number; // sum of (line_total - cost*qty) where cost is known
  costedRevenue: number; // revenue share with known costs
  marginPct: number | null; // null when no cost data
  voids: number;
}

export function completedSaleIds(sales: ReportSaleRow[]): Set<string> {
  return new Set(sales.filter((s) => s.status === "completed").map((s) => s.id));
}

export function aggregateSales(sales: ReportSaleRow[], items: ReportItemRow[]): SaleTotals {
  const completed = completedSaleIds(sales);
  let revenue = 0;
  let itemsSold = 0;
  let profit = 0;
  let costedRevenue = 0;
  for (const it of items) {
    if (!completed.has(it.sale_id)) continue;
    revenue = round2(revenue + it.line_total);
    itemsSold += it.quantity;
    if (it.cost_price != null) {
      costedRevenue = round2(costedRevenue + it.line_total);
      profit = round2(profit + it.line_total - it.cost_price * it.quantity);
    }
  }
  const voids = sales.length - completed.size;
  return {
    orders: completed.size,
    revenue,
    itemsSold,
    profit,
    costedRevenue,
    marginPct: costedRevenue > 0 ? round2((profit / costedRevenue) * 100) : null,
    voids,
  };
}

// ------------------------------------------------------------------
// Best sellers
// ------------------------------------------------------------------

export interface BestSeller {
  variantId: string;
  productName: string;
  sizeColor: string;
  units: number;
  revenue: number;
  profit: number | null; // null when cost unknown for all units
}

export function bestSellers(
  items: ReportItemRow[],
  completedIds: Set<string>,
  limit = 10
): BestSeller[] {
  const byVariant = new Map<
    string,
    { name: string; sizeColor: string; units: number; revenue: number; profit: number | null }
  >();
  for (const it of items) {
    if (!completedIds.has(it.sale_id)) continue;
    const key = it.variant_id;
    const entry = byVariant.get(key) ?? {
      name: it.variant?.product?.name ?? "Unknown product",
      sizeColor: [it.variant?.size, it.variant?.color].filter(Boolean).join(" · "),
      units: 0,
      revenue: 0,
      profit: null,
    };
    entry.units += it.quantity;
    entry.revenue = round2(entry.revenue + it.line_total);
    if (it.cost_price != null) {
      const lineProfit = round2(it.line_total - it.cost_price * it.quantity);
      entry.profit = round2((entry.profit ?? 0) + lineProfit);
    }
    byVariant.set(key, entry);
  }
  return [...byVariant.entries()]
    .map(([variantId, e]) => ({
      variantId,
      productName: e.name,
      sizeColor: e.sizeColor,
      units: e.units,
      revenue: e.revenue,
      profit: e.profit,
    }))
    .sort((a, b) => b.units - a.units || b.revenue - a.revenue)
    .slice(0, limit);
}

// ------------------------------------------------------------------
// Slow movers: stock available but no sales in the period
// ------------------------------------------------------------------

export interface SlowMover {
  variantId: string;
  productName: string;
  sizeColor: string;
  stockQty: number;
  unitsSold: number;
}

export function unitsSoldPerVariant(items: ReportItemRow[], completedIds: Set<string>): Map<string, number> {
  const map = new Map<string, number>();
  for (const it of items) {
    if (!completedIds.has(it.sale_id)) continue;
    map.set(it.variant_id, (map.get(it.variant_id) ?? 0) + it.quantity);
  }
  return map;
}

export function slowMovers(
  variants: ReportVariantRow[],
  items: ReportItemRow[],
  completedIds: Set<string>
): SlowMover[] {
  const sold = unitsSoldPerVariant(items, completedIds);
  return variants
    .filter((v) => v.is_active && v.stock_qty > 0 && (sold.get(v.id) ?? 0) === 0)
    .map((v) => ({
      variantId: v.id,
      productName: v.product?.name ?? "Unknown product",
      sizeColor: [v.size, v.color].filter(Boolean).join(" · "),
      stockQty: v.stock_qty,
      unitsSold: 0,
    }))
    .sort((a, b) => b.stockQty - a.stockQty);
}

// ------------------------------------------------------------------
// Payments
// ------------------------------------------------------------------

export interface PaymentSplit {
  method: PaymentMethod;
  amount: number;
}

const PAYMENT_ORDER: PaymentMethod[] = ["cash", "card", "qr", "credit"];

export function paymentSplit(payments: ReportPaymentRow[]): PaymentSplit[] {
  const totals = new Map<PaymentMethod, number>();
  for (const p of payments) {
    if (p.status !== "success") continue;
    totals.set(p.method, round2((totals.get(p.method) ?? 0) + p.amount));
  }
  return PAYMENT_ORDER.filter((m) => totals.has(m)).map((m) => ({ method: m, amount: totals.get(m)! }));
}

// ------------------------------------------------------------------
// Daily breakdown (last N days, local timezone)
// ------------------------------------------------------------------

export interface DailyRow {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "Mon 3"
  revenue: number;
  orders: number;
}

export function dailyBreakdown(sales: ReportSaleRow[], items: ReportItemRow[], days = 14, now = new Date()): DailyRow[] {
  const completed = new Set(sales.filter((s) => s.status === "completed").map((s) => s.id));
  const revenueByDay = new Map<string, number>();
  const ordersByDay = new Map<string, number>();
  for (const s of sales) {
    if (!completed.has(s.id)) continue;
    const d = new Date(s.sale_date);
    const key = dateKey(d);
    ordersByDay.set(key, (ordersByDay.get(key) ?? 0) + 1);
  }
  for (const it of items) {
    if (!completed.has(it.sale_id)) continue;
    const sale = sales.find((s) => s.id === it.sale_id);
    if (!sale) continue;
    const key = dateKey(new Date(sale.sale_date));
    revenueByDay.set(key, round2((revenueByDay.get(key) ?? 0) + it.line_total));
  }
  const rows: DailyRow[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d);
    rows.push({
      date: key,
      label: d.toLocaleDateString("en-LK", { weekday: "short", day: "numeric" }),
      revenue: revenueByDay.get(key) ?? 0,
      orders: ordersByDay.get(key) ?? 0,
    });
  }
  return rows;
}

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Revenue growth between the two halves of a daily series
 * (e.g. last 7 days vs the 7 before them). Returns null when
 * there is no prior revenue to compare against.
 */
export function growthPct(rows: DailyRow[]): number | null {
  if (rows.length < 2) return null;
  const mid = Math.floor(rows.length / 2);
  const prior = round2(rows.slice(0, mid).reduce((a, r) => a + r.revenue, 0));
  const recent = round2(rows.slice(mid).reduce((a, r) => a + r.revenue, 0));
  if (prior <= 0) return recent > 0 ? 100 : null;
  return round2(((recent - prior) / prior) * 100);
}

export function variantLabel(size: string | null, color: string | null): string {
  return [size, color].filter(Boolean).join(" · ") || "—";
}
