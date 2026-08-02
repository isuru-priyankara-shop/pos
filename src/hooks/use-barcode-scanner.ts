"use client";

import { useEffect, useRef } from "react";

// HID barcode scanners present as keyboards: a burst of printable
// characters (< ~100ms apart) terminated by Enter. Normal typing is
// slower, so it is ignored. Inputs/textarea focus is never intercepted.
const SCAN_KEY_GAP_MS = 100;
const MAX_SCAN_LENGTH = 64;

export function useBarcodeScanner(
  onScan: (barcode: string) => void,
  enabled = true
) {
  const buffer = useRef<string[]>([]);
  const lastKeyTime = useRef(0);
  const handler = useRef(onScan);

  useEffect(() => {
    if (!enabled) return;

    handler.current = onScan;

    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const now = Date.now();

      if (e.key === "Enter") {
        const code = buffer.current.join("");
        buffer.current = [];
        lastKeyTime.current = 0;
        if (code.length >= 4 && code.length <= MAX_SCAN_LENGTH) {
          handler.current(code);
        }
        return;
      }

      // slow key -> not a scanner burst; reset
      if (buffer.current.length > 0 && now - lastKeyTime.current > SCAN_KEY_GAP_MS) {
        buffer.current = [];
      }
      if (e.key.length === 1 && /[\x20-\x7e]/.test(e.key)) {
        buffer.current.push(e.key);
        lastKeyTime.current = now;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, onScan]);
}
