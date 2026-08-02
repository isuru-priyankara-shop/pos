// TypeScript types mirroring supabase/migrations/00001_schema.sql

export type Role = "admin" | "manager" | "cashier";

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  email: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
}

export interface Product {
  id: string;
  name: string;
  sku_prefix: string | null;
  category_id: string | null;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  size: string | null;
  color: string | null;
  barcode: string;
  price: number;
  cost_price: number | null;
  stock_qty: number;
  reorder_level: number;
  is_active: boolean;
  created_at: string;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  loyalty_points: number;
  credit_balance: number;
  created_at: string;
}

export type SaleStatus = "completed" | "refunded" | "void";

export interface Sale {
  id: string; // client-generated UUID (offline idempotency)
  customer_id: string | null;
  cashier_id: string;
  sale_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  status: SaleStatus;
  created_offline: boolean;
  synced_at: string | null;
  void_reason: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  variant_id: string;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
  cost_price?: number | null; // snapshot at sale time (00008); null = cost unknown
}

export type PaymentMethod = "cash" | "card" | "qr" | "credit";
export type PaymentStatus = "success" | "pending_capture" | "failed" | "refunded";

export interface Payment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount: number;
  transaction_ref: string | null;
  status: PaymentStatus;
}

export type InventoryTxType = "restock" | "sale" | "adjustment" | "return";

export interface InventoryTransaction {
  id: string;
  variant_id: string;
  type: InventoryTxType;
  quantity: number;
  reference_id: string | null;
  created_at: string;
}

export interface StockConflict {
  id: string;
  sale_id: string | null;
  variant_id: string;
  requested_quantity: number;
  available_quantity: number;
  resolved: boolean;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  status: "pending" | "received" | "cancelled";
  order_date: string;
  received_date: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  po_id: string;
  variant_id: string;
  quantity: number;
  cost_price: number | null;
}

export interface LoyaltyTransaction {
  id: string;
  customer_id: string;
  points: number;
  type: "earn" | "redeem" | "adjust";
  reference_id: string | null;
  created_at: string;
}

export interface AppSettings {
  key: string;
  value: string;
  updated_at: string;
}

export type SettingsKey = "void_threshold" | "tax_rate" | "loyalty_points_per_currency";

// ------------------------------------------------------------------
// Sync engine local (Dexie) state
// ------------------------------------------------------------------

export type LocalSaleStatus = "pending_sync" | "synced" | "sync_failed";

export interface LocalSale extends Sale {
  items: LocalSaleItem[];
  payments: LocalPayment[];
  local_status: LocalSaleStatus;
  sync_error?: string | null;
  last_sync_attempt?: number | null;
}

export type LocalSaleItem = SaleItem;

export type LocalPayment = Payment;

export type LocalCustomer = Customer;

export interface LocalVariant extends ProductVariant {
  product_name?: string;
}
