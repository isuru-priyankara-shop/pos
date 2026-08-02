import type { Category, Product, ProductVariant } from "./db.types";

export type VariantStatus = "in_stock" | "low" | "out" | "disabled";

export interface ProductRow extends Product {
  variants: ProductVariant[];
  category: Category | null;
}

export interface VariantForm {
  size: string;
  color: string;
  barcode: string;
  price: number;
  cost_price: number | null;
  reorder_level: number;
}

export interface VariantFormErrors {
  size?: string;
  color?: string;
  barcode?: string;
  price?: string;
}

/** Basic client-side validation; DB enforces barcode uniqueness server-side. */
export function validateVariantForm(form: VariantForm): VariantFormErrors {
  const errors: VariantFormErrors = {};
  const barcode = form.barcode.trim();
  if (!barcode) {
    errors.barcode = "Barcode is required";
  } else if (!/^[A-Za-z0-9\-_]{4,48}$/.test(barcode)) {
    errors.barcode = "4-48 alphanumeric characters";
  }
  if (!form.size.trim() && !form.color.trim()) {
    errors.size = "Size or color required";
  }
  if (!Number.isFinite(form.price) || form.price <= 0) {
    errors.price = "Price must be greater than 0";
  }
  return errors;
}

/** Low stock = still in stock but at/below reorder level. */
export function variantStatus(v: Pick<ProductVariant, "is_active" | "stock_qty" | "reorder_level">): VariantStatus {
  if (!v.is_active) return "disabled";
  if (v.stock_qty <= 0) return "out";
  if (v.stock_qty <= v.reorder_level) return "low";
  return "in_stock";
}

export interface StockPreview {
  current: number;
  next: number;
}

/** Restock adds units; adjustment sets the absolute level. */
export function stockPreview(
  current: number,
  action: "restock" | "adjust",
  quantity: number
): StockPreview {
  const qty = Math.max(0, Math.round(quantity));
  return {
    current,
    next: action === "restock" ? current + qty : qty,
  };
}

export function isVariantBarcodeUsed(
  barcode: string,
  variants: Pick<ProductVariant, "id" | "barcode">[],
  excludeId?: string
): boolean {
  const b = barcode.trim().toLowerCase();
  return variants.some((v) => v.id !== excludeId && v.barcode.toLowerCase() === b);
}
