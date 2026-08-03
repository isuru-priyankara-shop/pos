"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { applyTheme, THEME_EVENT, THEME_KEYS } from "@/lib/theme";

export function ThemeApplier() {
  useEffect(() => {
    let cancelled = false;

    const fetchAndApply = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("app_settings").select("key, value");
      if (cancelled) return;
      if (!data) {
        applyTheme(null, null);
        return;
      }
      const get = (key: string) => data.find((row) => row.key === key)?.value ?? null;
      applyTheme(get(THEME_KEYS.primary), get(THEME_KEYS.secondary));
    };

    void fetchAndApply();
    window.addEventListener(THEME_EVENT, fetchAndApply);
    return () => {
      cancelled = true;
      window.removeEventListener(THEME_EVENT, fetchAndApply);
    };
  }, []);

  return null;
}
