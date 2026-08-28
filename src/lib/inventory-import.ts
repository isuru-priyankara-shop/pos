// Pure Excel-import helpers for bulk inventory creation. A sheet row maps to
// one product variant; consecutive rows sharing a product name (and category)
// are grouped under a single product.

export interface ParsedVariant {
  rowNumber: number;
  size: string;
  color: string;
  barcode: string;
  barcodeGenerated: boolean;
  price: number;
  costPrice: number | null;
  stockQty: number;
  reorderLevel: number;
}

export interface ParsedProduct {
  name: string;
  category: string | null;
  skuPrefix: string | null;
  variants: ParsedVariant[];
}

export interface RowIssue {
  rowNumber: number;
  message: string;
}

export interface ParseResult {
  products: ParsedProduct[];
  issues: RowIssue[];
}

/** Canonical headers used by the downloadable template. */
export const INVENTORY_TEMPLATE_HEADERS = [
  "Product Name",
  "Category",
  "SKU Prefix",
  "Barcode",
  "Size",
  "Color",
  "Price",
  "Cost Price",
  "Stock Qty",
  "Reorder Level",
] as const;

const HEADER_ALIASES: Record<string, string> = {
  productname: "name",
  product: "name",
  name: "name",
  title: "name",
  category: "category",
  type: "category",
  skuprefix: "skuPrefix",
  sku: "skuPrefix",
  barcode: "barcode",
  upc: "barcode",
  ean: "barcode",
  code: "barcode",
  size: "size",
  variantsize: "size",
  color: "color",
  colour: "color",
  price: "price",
  retailprice: "price",
  sellingprice: "price",
  unitprice: "price",
  costprice: "costPrice",
  cost: "costPrice",
  stockqty: "stockQty",
  stock: "stockQty",
  qty: "stockQty",
  quantity: "stockQty",
  reorderlevel: "reorderLevel",
  reorder: "reorderLevel",
  minstock: "reorderLevel",
};

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mapRow(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    const field = HEADER_ALIASES[normalizeKey(key)];
    if (field) mapped[field] = value;
  }
  return mapped;
}

/** Tolerant numeric parse: handles "Rs 1,250.00", "LKR 90", "" → fallback. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[^0-9.-]/g, "");
  if (!cleaned || cleaned === "." || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

let generatedCounter = 0;
export function generateBarcode(rowNumber: number): string {
  generatedCounter = (generatedCounter + 1) % 1296;
  const stamp = Date.now().toString(36).toUpperCase().slice(-7);
  return `IMP${stamp}${generatedCounter.toString(36).toUpperCase()}${pad2(rowNumber)}`;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function parseInventoryRows(rows: Record<string, unknown>[]): ParseResult {
  const products: ParsedProduct[] = [];
  const issues: RowIssue[] = [];
  const byGroup = new Map<string, ParsedProduct>();
  const barcodesInFile = new Map<string, number>();

  rows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // +2: header row is 1, sheets are 1-based
    const row = mapRow(rawRow);

    // Skip completely blank lines
    const hasContent = Object.values(row).some((v) => toText(v) !== "");
    if (!hasContent) return;

    const name = toText(row.name);
    if (!name) {
      issues.push({ rowNumber, message: "Missing product name" });
      return;
    }
    const price = toNumber(row.price);
    if (price == null || price <= 0) {
      issues.push({ rowNumber, message: `Invalid or missing price for "${name}"` });
      return;
    }

    let barcode = toText(row.barcode);
    let barcodeGenerated = false;
    if (!barcode) {
      barcode = generateBarcode(rowNumber);
      barcodeGenerated = true;
    } else if (!/^[A-Za-z0-9\-_]{4,48}$/.test(barcode)) {
      issues.push({ rowNumber, message: `Barcode "${barcode}" must be 4-48 letters/digits` });
      return;
    }
    const dupInFile = barcodesInFile.get(barcode.toLowerCase());
    if (dupInFile != null) {
      issues.push({ rowNumber, message: `Duplicate barcode "${barcode}" (also on row ${dupInFile})` });
      return;
    }
    barcodesInFile.set(barcode.toLowerCase(), rowNumber);

    const stockQty = Math.max(0, Math.round(toNumber(row.stockQty) ?? 0));
    const variant: ParsedVariant = {
      rowNumber,
      size: toText(row.size),
      color: toText(row.color),
      barcode,
      barcodeGenerated,
      price,
      costPrice: toNumber(row.costPrice),
      stockQty,
      reorderLevel: Math.max(0, Math.round(toNumber(row.reorderLevel) ?? 5)),
    };

    const groupKey = `${name.toLowerCase()}||${toText(row.category).toLowerCase()}`;
    let product = byGroup.get(groupKey);
    if (!product) {
      product = {
        name,
        category: toText(row.category) || null,
        skuPrefix: toText(row.skuPrefix) || null,
        variants: [],
      };
      byGroup.set(groupKey, product);
      products.push(product);
    }
    product.variants.push(variant);
  });

  return { products, issues };
}
