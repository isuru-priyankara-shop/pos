import type { PaymentMethod, ProductVariant, Sale, SaleItem, Payment } from "./db.types";
import { lineTotal, round2, mulMoney, addMoney } from "./money";

export interface VariantWithProduct extends ProductVariant {
  product_name: string;
}

export interface CartLine {
  variant: VariantWithProduct;
  quantity: number;
  line_discount: number;
}

export interface PaymentEntry {
  id: string;
  method: PaymentMethod;
  amount: number;
}

export interface SalePayload {
  sale: Sale;
  items: SaleItem[];
  payments: Payment[];
}

export function cartToTotalsInput(cart: CartLine[]) {
  return cart.map((l) => ({
    unit_price: l.variant.price,
    quantity: l.quantity,
    line_discount: l.line_discount,
    line_total: lineTotal(l.variant.price, l.quantity, l.line_discount),
  }));
}

/**
 * Payment summary for cashier feedback.
 * cashSum can exceed what is owed (cash change); card/qr/credit are exact.
 */
export function computePaymentSummary(
  entries: PaymentEntry[],
  grandTotal: number
): { totalPaid: number; cashSum: number; nonCashSum: number; change: number; shortfall: number } {
  const cashSum = round2(
    entries.filter((e) => e.method === "cash").reduce((acc, e) => acc + e.amount, 0)
  );
  const nonCashSum = round2(
    entries.filter((e) => e.method !== "cash").reduce((acc, e) => acc + e.amount, 0)
  );
  const remaining = round2(Math.max(0, grandTotal - nonCashSum));
  const totalPaid = addMoney(cashSum, nonCashSum);
  const change = round2(Math.max(0, cashSum - remaining));
  const shortfall = round2(remaining - cashSum);
  return { totalPaid, cashSum, nonCashSum, change, shortfall };
}

/**
 * Builds the record_sale payload. Payment status: success for online sales;
 * card/qr without a captured transaction ref are marked pending_capture
 * (relevant for the offline path; online they are plain success).
 */
export function buildSalePayload(
  cart: CartLine[],
  customerId: string | null,
  cashierId: string,
  taxRatePct: number,
  payments: PaymentEntry[],
  createdOffline = false
): SalePayload {
  const saleId = crypto.randomUUID();

  const items: SaleItem[] = cart.map((l) => {
    const unit = round2(l.variant.price);
    return {
      id: crypto.randomUUID(),
      sale_id: saleId,
      variant_id: l.variant.id,
      quantity: l.quantity,
      unit_price: unit,
      line_discount: round2(l.line_discount),
      line_total: lineTotal(unit, l.quantity, l.line_discount),
    };
  });

  const lines = cartToTotalsInput(cart);
  const subtotal = round2(lines.reduce((acc, l) => acc + mulMoney(l.unit_price, l.quantity), 0));
  const discountTotal = round2(lines.reduce((acc, l) => acc + l.line_discount, 0));
  const taxable = Math.max(0, subtotal - discountTotal);
  const taxTotal = round2(taxable * (taxRatePct / 100));
  const grandTotal = round2(taxable + taxTotal);

  const sale: Sale = {
    id: saleId,
    customer_id: customerId,
    cashier_id: cashierId,
    sale_date: new Date().toISOString(),
    subtotal,
    discount_total: discountTotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    status: "completed",
    created_offline: createdOffline,
    synced_at: null,
    void_reason: null,
  };

  const paymentRows: Payment[] = payments.map((p) => ({
    id: p.id || crypto.randomUUID(),
    sale_id: saleId,
    method: p.method,
    amount: round2(p.amount),
    transaction_ref: null,
    status: p.method === "cash" ? "success" : "success",
  }));

  return { sale, items, payments: paymentRows };
}
