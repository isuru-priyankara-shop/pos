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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.from("app_settings").select("key, value");
      if (cancelled || !data) return;
      setValues((prev) => {
        const next = { ...prev };
        for (const row of data) {
          if (row.key === THEME_KEYS.primary || row.key === THEME_KEYS.secondary) {
            if (hexIsValid(row.value)) next[row.key] = row.value.toLowerCase();
          }
        }
        return next;
      });
      setStoreDetails(storeDetailsFromRows(data));
      setLoaded(true);
    };
    void load();
    return () => {
      cancelled = true;
    };
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
      window.dispatchEvent(new Event(STORE_DETAILS_EVENT));
      toast.success("Store details saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save store details");
    } finally {
      setStoreSaving(false);
    }
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
          Set up your store, customize its theme, and find support details.
        </p>
      </div>

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
