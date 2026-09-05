"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ACCENT_PRESETS,
  applyTheme,
  DEFAULT_THEME,
  hexIsValid,
  THEME_EVENT,
  THEME_KEYS,
} from "@/lib/theme";
import {
  EMPTY_STORE_DETAILS,
  PRODUCT_OWNER_PASSWORD,
  STORE_CATEGORIES,
  STORE_DETAILS_EVENT,
  STORE_SETTING_KEYS,
  storeDetailsFromRows,
  type StoreDetails,
} from "@/lib/store-details";
import {
  parseStoreCategoriesConfig,
  serializeStoreCategoriesConfig,
  STORE_CATEGORIES_CONFIG_EVENT,
  STORE_CATEGORY_PRESETS,
  type StoreCategoriesConfig,
} from "@/lib/store-categories";
import type { Category } from "@/lib/db.types";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FolderCog,
  Pencil,
  Plus,
  Sparkles,
  Store,
  Trash2,
} from "lucide-react";

type ThemeColor = {
  key: string;
  label: string;
  description: string;
};

const COLORS: ThemeColor[] = [
  {
    key: THEME_KEYS.primary,
    label: "Primary",
    description: "Buttons, focus rings, and the sidebar highlight",
  },
  {
    key: THEME_KEYS.secondary,
    label: "Secondary",
    description: "Accent backgrounds and hover states",
  },
];

export function SettingsPanel() {
  const { supabase } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({
    [THEME_KEYS.primary]: DEFAULT_THEME.primary,
    [THEME_KEYS.secondary]: DEFAULT_THEME.secondary,
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storeDetails, setStoreDetails] = useState<StoreDetails>(EMPTY_STORE_DETAILS);
  const [ownerPassword, setOwnerPassword] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);
  const ownerUnlocked = ownerPassword === PRODUCT_OWNER_PASSWORD;

  // Category Configuration state
  const [categories, setCategories] = useState<Category[]>([]);
  const [productCounts, setProductCounts] = useState<Record<string, number>>({});
  const [categoriesConfig, setCategoriesConfig] = useState<StoreCategoriesConfig>({});
  const [selectedStoreCategory, setSelectedStoreCategory] = useState<string>("");
  const [newCatName, setNewCatName] = useState("");
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");
  const [catSaving, setCatSaving] = useState(false);
  const [showOtherCategories, setShowOtherCategories] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [{ data: settingsData }, { data: catsData }, { data: prodsData }] =
        await Promise.all([
          supabase.from("app_settings").select("key, value"),
          supabase.from("categories").select("*").order("name"),
          supabase.from("products").select("id, category_id"),
        ]);
      if (cancelled) return;

      if (settingsData) {
        setValues((prev) => {
          const next = { ...prev };
          for (const row of settingsData) {
            if (row.key === THEME_KEYS.primary || row.key === THEME_KEYS.secondary) {
              if (hexIsValid(row.value)) next[row.key] = row.value.toLowerCase();
            }
          }
          return next;
        });
        const details = storeDetailsFromRows(settingsData);
        setStoreDetails(details);
        setSelectedStoreCategory((prev) => prev || details.category || "Bookshop");
        setCategoriesConfig(parseStoreCategoriesConfig(settingsData));
      }

      if (catsData) {
        setCategories(catsData as Category[]);
      }

      if (prodsData) {
        const counts: Record<string, number> = {};
        for (const p of prodsData) {
          if (p.category_id) {
            counts[p.category_id] = (counts[p.category_id] || 0) + 1;
          }
        }
        setProductCounts(counts);
      }

      setLoaded(true);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    const handleConfigEvent = async () => {
      const [{ data: catsData }, { data: settingsData }, { data: prodsData }] =
        await Promise.all([
          supabase.from("categories").select("*").order("name"),
          supabase.from("app_settings").select("key, value"),
          supabase.from("products").select("id, category_id"),
        ]);
      if (catsData) setCategories(catsData as Category[]);
      if (settingsData) setCategoriesConfig(parseStoreCategoriesConfig(settingsData));
      if (prodsData) {
        const counts: Record<string, number> = {};
        for (const p of prodsData) {
          if (p.category_id) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
        }
        setProductCounts(counts);
      }
    };
    window.addEventListener(STORE_CATEGORIES_CONFIG_EVENT, handleConfigEvent);
    return () => window.removeEventListener(STORE_CATEGORIES_CONFIG_EVENT, handleConfigEvent);
  }, [supabase]);

  const updateColor = (key: string, value: string) => {
    const next = { ...values, [key]: value };
    setValues(next);
    if (hexIsValid(value)) {
      applyTheme(next[THEME_KEYS.primary], next[THEME_KEYS.secondary]);
    }
  };

  const saveStoreDetails = async () => {
    if (!loaded || !ownerUnlocked) return;
    if (!storeDetails.category || !storeDetails.name.trim()) {
      toast.error("Choose a store category and enter the shop name");
      return;
    }
    setStoreSaving(true);
    try {
      const { error } = await supabase.from("app_settings").upsert(
        [
          { key: STORE_SETTING_KEYS.category, value: storeDetails.category },
          { key: STORE_SETTING_KEYS.name, value: storeDetails.name.trim() },
          { key: STORE_SETTING_KEYS.location, value: storeDetails.location.trim() },
        ],
        { onConflict: "key" },
      );
      if (error) throw error;
      setSelectedStoreCategory(storeDetails.category);
      window.dispatchEvent(new Event(STORE_DETAILS_EVENT));
      toast.success("Store details saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save store details");
    } finally {
      setStoreSaving(false);
    }
  };

  const saveConfigToDb = async (nextConfig: StoreCategoriesConfig) => {
    setCategoriesConfig(nextConfig);
    const { error } = await supabase.from("app_settings").upsert(
      {
        key: STORE_SETTING_KEYS.categories_config,
        value: serializeStoreCategoriesConfig(nextConfig),
      },
      { onConflict: "key" },
    );
    if (error) {
      toast.error("Failed to save categories configuration");
      return false;
    }
    window.dispatchEvent(new Event(STORE_CATEGORIES_CONFIG_EVENT));
    return true;
  };

  const activeStoreCategory = selectedStoreCategory || storeDetails.category || "Bookshop";
  const activeCategoryIds = categoriesConfig[activeStoreCategory] ?? [];
  const activeCategorySet = new Set(activeCategoryIds);

  const currentStoreCategories = categories.filter((c) => activeCategorySet.has(c.id));
  const otherCategories = categories.filter((c) => !activeCategorySet.has(c.id));
  const presets = STORE_CATEGORY_PRESETS[activeStoreCategory] ?? [];

  const handleAddCategory = async (nameToAdd?: string) => {
    const name = (nameToAdd ?? newCatName).trim();
    if (!name) return;
    const storeCat = activeStoreCategory;

    setCatSaving(true);
    try {
      let cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!cat) {
        const { data, error } = await supabase
          .from("categories")
          .insert({ name })
          .select()
          .single();
        if (error) throw error;
        cat = data as Category;
        setCategories((prev) => [...prev, cat!].sort((a, b) => a.name.localeCompare(b.name)));
      }

      const currentIds = categoriesConfig[storeCat] ?? [];
      if (!currentIds.includes(cat.id)) {
        const nextConfig: StoreCategoriesConfig = {
          ...categoriesConfig,
          [storeCat]: [...currentIds, cat.id],
        };
        await saveConfigToDb(nextConfig);
      }

      if (!nameToAdd) setNewCatName("");
      toast.success(`Category "${name}" added to ${storeCat}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setCatSaving(false);
    }
  };

  const handleRenameCategory = async (id: string) => {
    const name = editingCatName.trim();
    if (!name) {
      setEditingCatId(null);
      return;
    }
    setCatSaving(true);
    try {
      const { error } = await supabase.from("categories").update({ name }).eq("id", id);
      if (error) throw error;
      setCategories((prev) =>
        prev
          .map((c) => (c.id === id ? { ...c, name } : c))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingCatId(null);
      window.dispatchEvent(new Event(STORE_CATEGORIES_CONFIG_EVENT));
      toast.success("Category renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename category");
    } finally {
      setCatSaving(false);
    }
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    const count = productCounts[id] ?? 0;
    if (count > 0) {
      toast.error(
        `Cannot delete "${name}" — ${count} product${count === 1 ? "" : "s"} use this category`,
      );
      return;
    }
    setCatSaving(true);
    try {
      const nextConfig: StoreCategoriesConfig = {};
      for (const [sCat, ids] of Object.entries(categoriesConfig)) {
        nextConfig[sCat] = ids.filter((catId) => catId !== id);
      }
      await saveConfigToDb(nextConfig);

      const { error } = await supabase.from("categories").delete().eq("id", id);
      if (error) throw error;

      setCategories((prev) => prev.filter((c) => c.id !== id));
      toast.success(`Category "${name}" deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setCatSaving(false);
    }
  };

  const handleAssignToStore = async (id: string, storeCat: string, name: string) => {
    const currentIds = categoriesConfig[storeCat] ?? [];
    if (currentIds.includes(id)) return;
    const nextConfig: StoreCategoriesConfig = {
      ...categoriesConfig,
      [storeCat]: [...currentIds, id],
    };
    await saveConfigToDb(nextConfig);
    toast.success(`"${name}" added to ${storeCat}`);
  };

  const persist = async () => {
    if (!loaded) return;
    for (const color of COLORS) {
      if (!hexIsValid(values[color.key])) {
        toast.error("Please enter a valid hex color");
        return;
      }
    }
    setSaving(true);
    try {
      const rows = COLORS.map((color) => ({
        key: color.key,
        value: values[color.key].toLowerCase(),
      }));
      const { error } = await supabase
        .from("app_settings")
        .upsert(rows, { onConflict: "key" });
      if (error) throw error;
      window.dispatchEvent(new Event(THEME_EVENT));
      toast.success("Theme saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save theme");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("app_settings")
        .delete()
        .in("key", [THEME_KEYS.primary, THEME_KEYS.secondary]);
      if (error) throw error;
      setValues({
        [THEME_KEYS.primary]: DEFAULT_THEME.primary,
        [THEME_KEYS.secondary]: DEFAULT_THEME.secondary,
      });
      applyTheme(null, null);
      window.dispatchEvent(new Event(THEME_EVENT));
      toast.success("Theme reset to default");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reset theme");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Set up your store, configure categories, customize its theme, and find support details.
        </p>
      </div>

      {/* 1. Store Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Store details</CardTitle>
          <CardDescription>
            Complete these details to unlock the rest of the POS navigation. Only
            the product owner can edit them.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="owner-password">Product owner password</Label>
            <Input
              id="owner-password"
              type="password"
              inputMode="numeric"
              value={ownerPassword}
              onChange={(event) => setOwnerPassword(event.target.value)}
              placeholder="Enter password to edit"
              aria-describedby="owner-password-hint"
            />
            <p id="owner-password-hint" className="text-xs text-muted-foreground">
              {ownerPassword && !ownerUnlocked
                ? "Incorrect password. Store details remain locked."
                : "Enter the product owner password to enable these fields."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-category">Store category</Label>
            <Select
              value={storeDetails.category}
              onValueChange={(category) => setStoreDetails((details) => ({ ...details, category }))}
              disabled={!ownerUnlocked}
            >
              <SelectTrigger id="store-category" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {STORE_CATEGORIES.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-name">Shop name</Label>
            <Input
              id="store-name"
              value={storeDetails.name}
              onChange={(event) => setStoreDetails((details) => ({ ...details, name: event.target.value }))}
              placeholder="e.g. Main Street Books"
              disabled={!ownerUnlocked}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-location">Location <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="store-location"
              value={storeDetails.location}
              onChange={(event) => setStoreDetails((details) => ({ ...details, location: event.target.value }))}
              placeholder="e.g. Colombo"
              disabled={!ownerUnlocked}
            />
          </div>

          <Button className="w-full sm:w-auto" onClick={() => void saveStoreDetails()} disabled={!ownerUnlocked || storeSaving}>
            {storeSaving ? "Saving..." : "Save store details"}
          </Button>
        </CardContent>
      </Card>

      {/* 2. Configuration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FolderCog className="size-5 text-primary" />
                Category Configuration
              </CardTitle>
              <CardDescription>
                Configure categories for each store category. For example, if your shop is a Bookshop, you can add Books, Accessories, Toys, and Stationery. Categories added here will show in all category sections and POS.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Store Category Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="config-store-category">Store Category to Configure</Label>
              {activeStoreCategory === storeDetails.category && (
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Store className="size-3" />
                  Active Shop Category
                </Badge>
              )}
            </div>
            <Select
              value={activeStoreCategory}
              onValueChange={(val) => setSelectedStoreCategory(val)}
            >
              <SelectTrigger id="config-store-category" className="w-full">
                <SelectValue placeholder="Select store category to configure" />
              </SelectTrigger>
              <SelectContent>
                {STORE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat} {cat === storeDetails.category ? "★ (Current Shop)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quick-add suggestions */}
          {presets.length > 0 && (
            <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <Sparkles className="size-3.5 text-primary" />
                Suggested categories for {activeStoreCategory}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((preset) => {
                  const isAdded = currentStoreCategories.some(
                    (c) => c.name.toLowerCase() === preset.toLowerCase(),
                  );
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isAdded || catSaving}
                      onClick={() => void handleAddCategory(preset)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                        isAdded
                          ? "border-primary/40 bg-primary/10 text-primary cursor-default opacity-80"
                          : "border-border bg-background hover:border-primary/60 hover:text-primary active:scale-95 cursor-pointer",
                      )}
                    >
                      {isAdded ? (
                        <Check className="size-3 text-primary" />
                      ) : (
                        <Plus className="size-3 text-muted-foreground" />
                      )}
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Add Category Form */}
          <div className="space-y-2">
            <Label htmlFor="new-cat-input">Add category to {activeStoreCategory}</Label>
            <div className="flex gap-2">
              <Input
                id="new-cat-input"
                placeholder={`e.g. ${presets[0] ?? "Books"}, ${presets[1] ?? "Accessories"}…`}
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAddCategory();
                  }
                }}
                disabled={catSaving}
              />
              <Button
                type="button"
                onClick={() => void handleAddCategory()}
                disabled={catSaving || !newCatName.trim()}
              >
                <Plus className="size-4" /> Add
              </Button>
            </div>
          </div>

          {/* Categories List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Configured categories for {activeStoreCategory} ({currentStoreCategories.length})
              </Label>
            </div>

            {currentStoreCategories.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                <p className="font-medium">No categories configured for {activeStoreCategory} yet.</p>
                <p className="mt-1 text-xs">
                  Click any suggested category above or type a name to add it.
                </p>
              </div>
            ) : (
              <div className="divide-y rounded-lg border">
                {currentStoreCategories.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 px-3 py-2.5"
                  >
                    {editingCatId === c.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          value={editingCatName}
                          onChange={(e) => setEditingCatName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleRenameCategory(c.id);
                          }}
                          autoFocus
                          className="h-8 text-sm"
                        />
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => void handleRenameCategory(c.id)}
                          disabled={catSaving || !editingCatName.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8"
                          onClick={() => setEditingCatId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 truncate">
                          <span className="font-medium">{c.name}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                            {productCounts[c.id] ?? 0}{" "}
                            {(productCounts[c.id] ?? 0) === 1 ? "product" : "products"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingCatId(c.id);
                              setEditingCatName(c.name);
                            }}
                            title="Rename category"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => void handleDeleteCategory(c.id, c.name)}
                            title={(productCounts[c.id] ?? 0) > 0 ? "Cannot delete category with products" : "Delete category"}
                            disabled={(productCounts[c.id] ?? 0) > 0 || catSaving}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Other Categories Collapsible */}
          {otherCategories.length > 0 && (
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => setShowOtherCategories(!showOtherCategories)}
                className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
              >
                {showOtherCategories ? (
                  <ChevronDown className="size-3.5" />
                ) : (
                  <ChevronRight className="size-3.5" />
                )}
                Other categories in database ({otherCategories.length})
              </button>

              {showOtherCategories && (
                <div className="divide-y rounded-lg border bg-muted/10">
                  {otherCategories.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span>{c.name}</span>
                        <span className="text-muted-foreground">
                          ({productCounts[c.id] ?? 0} products)
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => void handleAssignToStore(c.id, activeStoreCategory, c.name)}
                        >
                          <Plus className="size-3 mr-1" /> Add to {activeStoreCategory}
                        </Button>
                        {(productCounts[c.id] ?? 0) === 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-destructive/70 hover:text-destructive"
                            onClick={() => void handleDeleteCategory(c.id, c.name)}
                            title="Delete category"
                            disabled={catSaving}
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Theme Colors Card */}
      <Card>
        <CardHeader>
          <CardTitle>Theme colors</CardTitle>
          <CardDescription>
            Pick primary and secondary colors for the app. Saved changes are
            shared across all devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Accent presets</Label>
            <p className="text-xs text-muted-foreground">
              One-line accent swaps. Pick a preset or enter a custom color below.
            </p>
            <div className="flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((preset) => {
                const isActive =
                  hexIsValid(values[THEME_KEYS.primary]) &&
                  values[THEME_KEYS.primary].toLowerCase() === preset.hex.toLowerCase();
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => updateColor(THEME_KEYS.primary, preset.hex)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-primary"
                        : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                    )}
                  >
                    <span
                      className="size-4 rounded-full border"
                      style={{ backgroundColor: preset.hex }}
                    />
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </div>

          {COLORS.map((color) => (
            <div key={color.key} className="space-y-2">
              <Label htmlFor={color.key}>{color.label}</Label>
              <p className="text-xs text-muted-foreground">{color.description}</p>
              <div className="flex items-center gap-3">
                <input
                  id={color.key}
                  type="color"
                  value={
                    hexIsValid(values[color.key]) ? values[color.key] : "#000000"
                  }
                  onChange={(e) => updateColor(color.key, e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded-md border bg-background p-1"
                />
                <Input
                  value={values[color.key]}
                  onChange={(e) => updateColor(color.key, e.target.value)}
                  className="w-32 font-mono"
                  placeholder="#000000"
                />
                <span
                  className="h-10 w-10 rounded-md border"
                  style={{
                    backgroundColor: hexIsValid(values[color.key])
                      ? values[color.key]
                      : "transparent",
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Separator />

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="w-full sm:w-auto" onClick={() => void persist()} disabled={saving}>
          {saving ? "Saving..." : "Save theme"}
        </Button>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => void reset()} disabled={saving}>
          Reset to default
        </Button>
      </div>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle>Contact, help & support</CardTitle>
          <CardDescription>
            Need help with this POS? Contact the product owner for account,
            setup, or technical support.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p className="font-medium">POS product owner</p>
          <p className="text-muted-foreground">
            Please use the support contact provided by your organization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
