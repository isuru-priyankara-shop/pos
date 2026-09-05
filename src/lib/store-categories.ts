import type { Category } from "./db.types";

export const STORE_CATEGORIES_CONFIG_KEY = "store_categories_config";
export const STORE_CATEGORIES_CONFIG_EVENT = "store-categories-config-updated";

export const STORE_CATEGORY_PRESETS: Record<string, string[]> = {
  Bookshop: [
    "Books",
    "Stationery",
    "Accessories",
    "Toys",
    "Magazines",
    "Art Supplies",
    "School Supplies",
    "Gifts",
  ],
  "Clothing store": [
    "Tops",
    "Bottoms",
    "Dresses",
    "Outerwear",
    "Footwear",
    "Accessories",
    "Activewear",
  ],
  Restaurant: [
    "Beverages",
    "Main Course",
    "Appetizers",
    "Desserts",
    "Snacks",
    "Combos",
  ],
  "Grocery store": [
    "Fruits & Vegetables",
    "Dairy & Eggs",
    "Bakery",
    "Beverages",
    "Snacks",
    "Canned Goods",
    "Household",
  ],
  "Electronics store": [
    "Phones & Tablets",
    "Computers",
    "Audio",
    "Cables & Adapters",
    "Accessories",
    "Storage",
  ],
  Pharmacy: [
    "Medicines",
    "First Aid",
    "Personal Care",
    "Vitamins & Supplements",
    "Baby Care",
    "Healthcare Devices",
  ],
  Other: ["General", "Miscellaneous"],
};

export type StoreCategoriesConfig = Record<string, string[]>;

export function parseStoreCategoriesConfig(
  raw: string | { key: string; value: string }[] | null | undefined,
): StoreCategoriesConfig {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const row = raw.find((r) => r.key === STORE_CATEGORIES_CONFIG_KEY);
    if (!row) return {};
    return parseStoreCategoriesConfig(row.value);
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const config: StoreCategoriesConfig = {};
      for (const [storeCat, catIds] of Object.entries(parsed)) {
        if (Array.isArray(catIds)) {
          config[storeCat] = catIds.filter((id): id is string => typeof id === "string");
        }
      }
      return config;
    }
  } catch {
    // fallback
  }
  return {};
}

export function serializeStoreCategoriesConfig(config: StoreCategoriesConfig): string {
  return JSON.stringify(config);
}

/**
 * Filter categories for the active store category.
 * If the store category has mapped categories, returns those categories.
 * If no categories are mapped for this storeCategory, returns all categories as fallback.
 */
export function getCategoriesForStore(
  categories: Category[],
  config: StoreCategoriesConfig,
  storeCategory?: string | null,
): Category[] {
  if (!storeCategory) return categories;
  const ids = config[storeCategory];
  if (!ids || ids.length === 0) {
    return categories;
  }
  const idSet = new Set(ids);
  const matched = categories.filter((c) => idSet.has(c.id));
  return matched.length > 0 ? matched : categories;
}

/**
 * Find which store category a category ID belongs to.
 */
export function getStoreCategoryForCategoryId(
  categoryId: string,
  config: StoreCategoriesConfig,
): string | null {
  for (const [storeCat, ids] of Object.entries(config)) {
    if (ids.includes(categoryId)) {
      return storeCat;
    }
  }
  return null;
}

