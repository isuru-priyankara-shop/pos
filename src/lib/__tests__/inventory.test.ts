import { describe, expect, it } from "vitest";
import {
  validateVariantForm,
  variantStatus,
  stockPreview,
  isVariantBarcodeUsed,
} from "@/lib/inventory";
import type { ProductVariant } from "@/lib/db.types";

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "v1",
    product_id: "p1",
    size: "M",
    color: "Blue",
    barcode: "100000000001",
    price: 19.99,
    cost_price: 8,
    stock_qty: 10,
    reorder_level: 5,
    is_active: true,
    created_at: "",
    ...overrides,
  };
}

describe("validateVariantForm", () => {
  it("accepts a valid form", () => {
    expect(
      validateVariantForm({ size: "M", color: "Blue", barcode: "100000000001", price: 19.99, cost_price: 8, reorder_level: 5 })
    ).toEqual({});
  });

  it("requires barcode of valid format", () => {
    expect(
      validateVariantForm({ size: "M", color: "", barcode: "", price: 10, cost_price: null, reorder_level: 0 }).barcode
    ).toBeTruthy();
    expect(
      validateVariantForm({ size: "M", color: "", barcode: "ab c!", price: 10, cost_price: null, reorder_level: 0 }).barcode
    ).toBeTruthy();
  });

  it("requires size or color", () => {
    const errs = validateVariantForm({ size: "", color: "", barcode: "12345678", price: 10, cost_price: null, reorder_level: 0 });
    expect(errs.size).toBeTruthy();
  });

  it("requires price > 0", () => {
    const errs = validateVariantForm({ size: "M", color: "", barcode: "12345678", price: 0, cost_price: null, reorder_level: 0 });
    expect(errs.price).toBeTruthy();
  });
});

describe("variantStatus", () => {
  it("classifies stock levels", () => {
    expect(variantStatus(variant({ stock_qty: 50, reorder_level: 5 }))).toBe("in_stock");
    expect(variantStatus(variant({ stock_qty: 5, reorder_level: 5 }))).toBe("low");
    expect(variantStatus(variant({ stock_qty: 0, reorder_level: 5 }))).toBe("out");
    expect(variantStatus(variant({ is_active: false, stock_qty: 50 }))).toBe("disabled");
  });
});

describe("stockPreview", () => {
  it("restock adds, adjust sets absolute", () => {
    expect(stockPreview(10, "restock", 5)).toEqual({ current: 10, next: 15 });
    expect(stockPreview(10, "adjust", 42)).toEqual({ current: 10, next: 42 });
  });

  it("clamps negative input", () => {
    expect(stockPreview(10, "restock", -5)).toEqual({ current: 10, next: 10 });
  });
});

describe("isVariantBarcodeUsed", () => {
  it("detects duplicates excluding self", () => {
    const variants = [variant({ id: "a", barcode: "100000000001" }), variant({ id: "b", barcode: "200000000002" })];
    expect(isVariantBarcodeUsed("200000000002", variants)).toBe(true);
    expect(isVariantBarcodeUsed("200000000002", variants, "b")).toBe(false);
    expect(isVariantBarcodeUsed("999999999999", variants)).toBe(false);
  });
});
