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
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize the store theme. Changes apply instantly to everyone.
        </p>
      </div>

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

      <div className="flex gap-2">
        <Button onClick={() => void persist()} disabled={saving}>
          {saving ? "Saving..." : "Save theme"}
        </Button>
        <Button variant="outline" onClick={() => void reset()} disabled={saving}>
          Reset to default
        </Button>
      </div>
    </div>
  );
}
