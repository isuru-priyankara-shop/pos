import { describe, expect, it } from "vitest";
import type { Category } from "../db.types";
import {
  getCategoriesForStore,
  getStoreCategoryForCategoryId,
  parseStoreCategoriesConfig,
  serializeStoreCategoriesConfig,
  STORE_CATEGORY_PRESETS,
  type StoreCategoriesConfig,
} from "../store-categories";

describe("store-categories helper", () => {
  it("has presets for all major store categories including Bookshop", () => {
    expect(STORE_CATEGORY_PRESETS["Bookshop"]).toBeDefined();
    expect(STORE_CATEGORY_PRESETS["Bookshop"]).toContain("Books");
    expect(STORE_CATEGORY_PRESETS["Bookshop"]).toContain("Accessories");
    expect(STORE_CATEGORY_PRESETS["Bookshop"]).toContain("Toys");
    expect(STORE_CATEGORY_PRESETS["Clothing store"]).toContain("Tops");
  });

  it("parses JSON config correctly", () => {
    const json = JSON.stringify({
      Bookshop: ["cat-1", "cat-2"],
      "Clothing store": ["cat-3"],
    });
    const config = parseStoreCategoriesConfig(json);
    expect(config["Bookshop"]).toEqual(["cat-1", "cat-2"]);
    expect(config["Clothing store"]).toEqual(["cat-3"]);
  });

  it("parses app_settings row array correctly", () => {
    const rows = [
      { key: "store_category", value: "Bookshop" },
      {
        key: "store_categories_config",
        value: JSON.stringify({ Bookshop: ["cat-1"] }),
      },
    ];
    const config = parseStoreCategoriesConfig(rows);
    expect(config["Bookshop"]).toEqual(["cat-1"]);
  });

  it("serializes config correctly", () => {
    const config: StoreCategoriesConfig = {
      Bookshop: ["cat-1", "cat-2"],
    };
    expect(serializeStoreCategoriesConfig(config)).toBe(
      JSON.stringify({ Bookshop: ["cat-1", "cat-2"] }),
    );
  });

  it("filters categories for store category correctly", () => {
    const categories: Category[] = [
      { id: "cat-1", name: "Books", parent_id: null, created_at: "" },
      { id: "cat-2", name: "Toys", parent_id: null, created_at: "" },
      { id: "cat-3", name: "Tops", parent_id: null, created_at: "" },
    ];
    const config: StoreCategoriesConfig = {
      Bookshop: ["cat-1", "cat-2"],
      "Clothing store": ["cat-3"],
    };

    const bookshopCats = getCategoriesForStore(categories, config, "Bookshop");
    expect(bookshopCats.map((c) => c.name)).toEqual(["Books", "Toys"]);

    const clothingCats = getCategoriesForStore(categories, config, "Clothing store");
    expect(clothingCats.map((c) => c.name)).toEqual(["Tops"]);

    // If storeCategory has no mappings, returns all
    const otherCats = getCategoriesForStore(categories, config, "Pharmacy");
    expect(otherCats.length).toBe(3);
  });

  it("retrieves store category for a category ID", () => {
    const config: StoreCategoriesConfig = {
      Bookshop: ["cat-1", "cat-2"],
    };
    expect(getStoreCategoryForCategoryId("cat-1", config)).toBe("Bookshop");
    expect(getStoreCategoryForCategoryId("cat-99", config)).toBeNull();
  });
});

