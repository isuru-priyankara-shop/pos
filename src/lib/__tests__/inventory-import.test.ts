import { describe, expect, it } from "vitest";
import {
  INVENTORY_TEMPLATE_HEADERS,
  generateBarcode,
  parseInventoryRows,
} from "@/lib/inventory-import";

describe("parseInventoryRows", () => {
  it("groups variant rows into products and normalizes headers", () => {
    const { products, issues } = parseInventoryRows([
      {
        "Product Name": "Nike Air Max",
        Category: "Footwear",
        "SKU Prefix": "NAM",
        Barcode: "9345219023",
        Size: "42",
        Color: "Black",
        Price: "Rs 12,500",
        "Cost Price": 9000,
        "Stock Qty": 10,
        "Reorder Level": 3,
      },
      {
        product: "nike air max", // same product, case-insensitive grouping
        category: "footwear",
        barcode: "9345219024",
        size: "43",
        price: 12500,
      },
    ]);
    expect(issues).toHaveLength(0);
    expect(products).toHaveLength(1);
    const p = products[0];
    expect(p.name).toBe("Nike Air Max");
    expect(p.category).toBe("Footwear");
    expect(p.skuPrefix).toBe("NAM");
    expect(p.variants).toHaveLength(2);
    expect(p.variants[0].price).toBe(12500);
    expect(p.variants[1].stockQty).toBe(0);
    expect(p.variants[1].reorderLevel).toBe(5); // default
  });

  it("reports rows with missing name or invalid price", () => {
    const { products, issues } = parseInventoryRows([
      { Barcode: "1234", Price: 10 }, // no name
      { Name: "Tee", Price: "abc" }, // bad price
      { Name: "Tee", Price: 0 }, // zero price
    ]);
    expect(products).toHaveLength(0);
    expect(issues.map((i) => i.rowNumber)).toEqual([2, 3, 4]);
  });

  it("auto-generates barcodes when blank and rejects malformed ones", () => {
    const { products, issues } = parseInventoryRows([
      { Name: "A", Price: 5, Barcode: "" },
      { Name: "B", Price: 5, Barcode: "ab" }, // too short
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("4-48");
    expect(products).toHaveLength(1);
    expect(products[0].variants[0].barcode).toMatch(/^IMP[A-Z0-9]{6,}$/);
    expect(generateBarcode(2)).toMatch(/^[A-Za-z0-9_-]{4,48}$/);
  });

  it("flags duplicate barcodes within the file", () => {
    const { issues } = parseInventoryRows([
      { Name: "A", Price: 5, Barcode: "DUP12345" },
      { Name: "B", Price: 5, Barcode: "dup12345" }, // case-insensitive dup
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("Duplicate barcode");
  });

  it("skips blank rows entirely", () => {
    const { products, issues } = parseInventoryRows([{ Name: "", Barcode: "", Price: "" }]);
    expect(products).toHaveLength(0);
    expect(issues).toHaveLength(0);
  });

  it("exposes the template headers", () => {
    expect(INVENTORY_TEMPLATE_HEADERS[0]).toBe("Product Name");
    expect(INVENTORY_TEMPLATE_HEADERS).toContain("Price");
  });
});
