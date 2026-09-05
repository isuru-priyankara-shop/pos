"use client";

import { useEffect, useState } from "react";
import { Minus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CartLine } from "@/lib/pos";
import { cartLineTotals } from "@/lib/pos";
import { formatCurrency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export interface CartTotals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
}

function QuantityInput({
  value,
  max,
  onChange,
  onRemove,
}: {
  value: number;
  max: number;
  onChange: (val: number) => void;
  onRemove: () => void;
}) {
  const [localVal, setLocalVal] = useState<string>(String(Math.floor(value)));

  useEffect(() => {
    setLocalVal(String(Math.floor(value)));
  }, [value]);

  const commit = () => {
    const trimmed = localVal.trim();
    if (!trimmed || isNaN(Number(trimmed))) {
      setLocalVal(String(Math.floor(value)));
      return;
    }
    const num = parseInt(trimmed, 10);
    if (num <= 0) {
      onRemove();
      return;
    }
    if (num > max) {
      toast.warning(`Only ${max} in stock`);
      onChange(max);
      setLocalVal(String(max));
      return;
    }
    onChange(num);
    setLocalVal(String(num));
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      className="h-7 w-12 px-1 text-center text-xs font-semibold tabular-nums"
      value={localVal}
      onChange={(e) => {
        // Strictly allow only whole digits 0-9 (no decimals, signs, or letters)
        const str = e.target.value.replace(/[^0-9]/g, "");
        setLocalVal(str);
        if (!str) return;
        const parsed = parseInt(str, 10);
        if (!isNaN(parsed) && parsed > 0) {
          if (parsed > max) {
            toast.warning(`Only ${max} in stock`);
            onChange(max);
            setLocalVal(String(max));
          } else {
            onChange(parsed);
          }
        }
      }}
      onKeyDown={(e) => {
        // Explicitly block decimal separators, exponent notation, and negative/plus signs
        if (
          e.key === "." ||
          e.key === "," ||
          e.key === "e" ||
          e.key === "E" ||
          e.key === "+" ||
          e.key === "-"
        ) {
          e.preventDefault();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData("text").replace(/[^0-9]/g, "");
        if (!pasted) return;
        setLocalVal(pasted);
        const parsed = parseInt(pasted, 10);
        if (!isNaN(parsed) && parsed > 0) {
          const clamped = Math.min(parsed, max);
          if (parsed > max) toast.warning(`Only ${max} in stock`);
          onChange(clamped);
          setLocalVal(String(clamped));
        }
      }}
      onBlur={commit}
      onFocus={(e) => e.currentTarget.select()}
      aria-label="Item quantity (integer only)"
    />
  );
}

export function CartPanel({
  lines,
  totals,
  cartDiscount,
  cartDiscountMode,
  onChangeQty,
  onSetQty,
  onRemoveLine,
  onSetDiscount,
  onCartDiscountChange,
  onCartDiscountModeChange,
  onClear,
  onCheckout,
}: {
  lines: CartLine[];
  totals: CartTotals;
  cartDiscount: number;
  cartDiscountMode: "fixed" | "percent";
  onChangeQty: (variantId: string, delta: number) => void;
  onSetQty?: (variantId: string, quantity: number) => void;
  onRemoveLine: (variantId: string) => void;
  onSetDiscount: (variantId: string, value: number, mode: "fixed" | "percent") => void;
  onCartDiscountChange: (value: number) => void;
  onCartDiscountModeChange: (mode: "fixed" | "percent") => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  const handleSetQuantity = (variantId: string, currentQty: number, nextQty: number) => {
    if (onSetQty) {
      onSetQty(variantId, nextQty);
    } else {
      onChangeQty(variantId, nextQty - currentQty);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h2 className="font-semibold">Current sale</h2>
        {lines.length > 0 && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Scan an item or tap a product to begin.
          </p>
        ) : (
          lines.map((l) => (
            <div key={l.variant.id} className="space-y-2 rounded-lg border p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{l.variant.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[l.variant.size, l.variant.color].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="-m-1 size-6" onClick={() => onRemoveLine(l.variant.id)}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </Button>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => onChangeQty(l.variant.id, -1)}
                    title="Decrease quantity"
                  >
                    <Minus className="size-3.5" />
                  </Button>
                  <QuantityInput
                    value={l.quantity}
                    max={l.variant.stock_qty}
                    onChange={(val) => handleSetQuantity(l.variant.id, l.quantity, val)}
                    onRemove={() => onRemoveLine(l.variant.id)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-7 shrink-0"
                    onClick={() => onChangeQty(l.variant.id, 1)}
                    disabled={l.quantity >= l.variant.stock_qty}
                    title={l.quantity >= l.variant.stock_qty ? "Maximum stock reached" : "Increase quantity"}
                  >
                    <Plus className="size-3.5" />
                  </Button>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatCurrency(cartLineTotals(l).line_total)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(l.variant.price)} × {l.quantity}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Discount</span>
                <Select
                  value={l.discount_type}
                  onValueChange={(v) => onSetDiscount(l.variant.id, l.line_discount, v as "fixed" | "percent")}
                >
                  <SelectTrigger className="h-7 w-14 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Rs</SelectItem>
                    <SelectItem value="percent">%</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-7 w-24 text-xs"
                  value={l.line_discount === 0 ? "" : l.line_discount}
                  placeholder={l.discount_type === "percent" ? "10%" : "0.00"}
                  onChange={(e) => onSetDiscount(l.variant.id, parseFloat(e.target.value) || 0, l.discount_type)}
                />
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-1 border-t p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatCurrency(totals.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Sale discount</span>
          <div className="flex items-center gap-1">
            <Select
              value={cartDiscountMode}
              onValueChange={(v) => onCartDiscountModeChange(v as "fixed" | "percent")}
              disabled={lines.length === 0}
            >
              <SelectTrigger className="h-7 w-14 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Rs</SelectItem>
                <SelectItem value="percent">%</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              step="0.01"
              className="h-7 w-24 text-right text-xs"
              value={cartDiscount === 0 ? "" : cartDiscount}
              placeholder={cartDiscountMode === "percent" ? "10%" : "0.00"}
              onChange={(e) => onCartDiscountChange(Math.max(0, parseFloat(e.target.value) || 0))}
              disabled={lines.length === 0}
            />
          </div>
        </div>
        {totals.discount_total > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Discount</span>
            <span>-{formatCurrency(totals.discount_total)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Tax</span>
          <span>{formatCurrency(totals.tax_total)}</span>
        </div>
        <Separator className="my-2" />
        <div className="flex justify-between text-xl font-semibold tracking-tight">
          <span>Total</span>
          <span>{formatCurrency(totals.grand_total)}</span>
        </div>
        <Button className="mt-3 h-10 w-full text-base font-semibold" disabled={lines.length === 0} onClick={onCheckout}>
          Charge {formatCurrency(totals.grand_total)}
        </Button>
      </div>
    </div>
  );
}
