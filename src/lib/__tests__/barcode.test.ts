// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";

function typeSequence(chars: string, gapMs: number, target: EventTarget = window) {
  // keep fake timers for the WHOLE burst (Date.now() must stay consistent)
  vi.useFakeTimers();
  chars.split("").forEach((c) => {
    vi.advanceTimersByTime(gapMs);
    target.dispatchEvent(new KeyboardEvent("keydown", { key: c, bubbles: true }));
  });
  vi.advanceTimersByTime(gapMs);
  target.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  vi.useRealTimers();
}

describe("useBarcodeScanner", () => {
  it("fires onScan for a fast scanner burst terminated by Enter", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeSequence("100000000001", 20);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("100000000001");
  });

  it("ignores slow human typing", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeSequence("123456", 150);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("does not fire for short input", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeSequence("abc", 20);

    expect(onScan).not.toHaveBeenCalled();
  });

  it("ignores keydown when focus is inside an input", () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    typeSequence("12345678", 20, input);

    expect(onScan).not.toHaveBeenCalled();
    input.remove();
  });
});
