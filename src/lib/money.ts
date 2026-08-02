// Money helpers. All currency math works in plain numbers rounded to 2dp
// (cash amounts are well within double precision limits; never use floats
// for per-unit storage - Postgres numeric(10,2) handles that).

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function addMoney(...values: number[]): number {
  return round2(values.reduce((acc, v) => acc + v, 0));
}

export function mulMoney(a: number, b: number): number {
  return round2(a * b);
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(round2(n));
}

export interface CartLineTotals {
  unit_price: number;
  quantity: number;
  line_discount: number;
  line_total: number;
}

export interface CartTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
}

export function lineTotal(unitPrice: number, quantity: number, lineDiscount: number): number {
  return round2(unitPrice * quantity - lineDiscount);
}

export function computeTotals(
  lines: CartLineTotals[],
  taxRatePct: number,
  cartDiscount: number
): CartTotals {
  const subtotal = round2(lines.reduce((acc, l) => acc + l.unit_price * l.quantity, 0));
  const discount_total = round2(
    lines.reduce((acc, l) => acc + l.line_discount, 0) + cartDiscount
  );
  const taxable = Math.max(0, subtotal - discount_total);
  const tax_total = round2(taxable * (taxRatePct / 100));
  const grand_total = round2(taxable + tax_total);
  return { subtotal, discount_total, tax_total, grand_total };
}

export function formatQuantity(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}
