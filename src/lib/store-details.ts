export const STORE_DETAILS_EVENT = "store-details-updated";
export const PRODUCT_OWNER_PASSWORD = "0701";

export const STORE_SETTING_KEYS = {
  category: "store_category",
  name: "store_name",
  location: "store_location",
} as const;

export const STORE_CATEGORIES = [
  "Clothing store",
  "Restaurant",
  "Bookshop",
  "Grocery store",
  "Electronics store",
  "Pharmacy",
  "Other",
] as const;

export type StoreDetails = {
  category: string;
  name: string;
  location: string;
};

export const EMPTY_STORE_DETAILS: StoreDetails = {
  category: "",
  name: "",
  location: "",
};

export function storeDetailsFromRows(
  rows: { key: string; value: string }[] | null | undefined,
): StoreDetails {
  const settings = new Map((rows ?? []).map((row) => [row.key, row.value]));
  return {
    category: settings.get(STORE_SETTING_KEYS.category) ?? "",
    name: settings.get(STORE_SETTING_KEYS.name) ?? "",
    location: settings.get(STORE_SETTING_KEYS.location) ?? "",
  };
}

export function hasCompletedStoreDetails(details: StoreDetails) {
  return Boolean(details.category.trim() && details.name.trim());
}
