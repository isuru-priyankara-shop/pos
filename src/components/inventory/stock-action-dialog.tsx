"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { ProductVariant } from "@/lib/db.types";
import { stockPreview } from "@/lib/inventory";
import { formatCurrency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function StockActionDialog({
  target,
  onOpenChange,
  onSaved,
}: {
  target: { variant: ProductVariant; action: "restock" | "adjust" } | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const open = !!target;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && target && (
        <DialogContent className="sm:max-w-sm">
          <StockActionForm
            key={`${target.variant.id}-${target.action}`}
            variant={target.variant}
            action={target.action}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function StockActionForm({
  variant,
  action,
  onOpenChange,
  onSaved,
}: {
  variant: ProductVariant;
  action: "restock" | "adjust";
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const [quantity, setQuantity] = useState(0);
  const [saving, setSaving] = useState(false);

  const preview = stockPreview(variant.stock_qty, action, quantity);

  async function handleSave() {
    if (preview.next < 0) {
      toast.error("Adjustment cannot set stock below zero");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("inventory_transactions").insert({
        id: crypto.randomUUID(),
        variant_id: variant.id,
        type: action,
        quantity: action === "restock" ? Math.round(quantity) : preview.next,
      });
      if (error) throw error;
      await onSaved();
      toast.success(
        action === "restock" ? `Restocked ${Math.round(quantity)} units` : `Stock adjusted to ${preview.next}`
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{action === "restock" ? "Restock" : "Adjust stock"}</DialogTitle>
        <DialogDescription>
          {`${[variant.size, variant.color].filter(Boolean).join(" · ") || "Variant"} — currently ${variant.stock_qty} in stock`}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="stock-qty">
            {action === "restock" ? "Units to add" : "New absolute stock level"}
          </Label>
          <Input
            id="stock-qty"
            type="number"
            min="0"
            step="1"
            value={quantity || ""}
            onChange={(e) => setQuantity(Number(e.target.value))}
            placeholder={action === "restock" ? "10" : "25"}
          />
        </div>
        <div className="flex justify-between rounded-lg border bg-muted/50 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            {action === "restock" ? "After restock" : "Current → new"}
          </span>
          <span className="font-medium">
            {action === "restock" ? (
              preview.next
            ) : (
              <>
                {preview.current} → {preview.next}
              </>
            )}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Price basis: {formatCurrency(variant.price)} — this action is audit-logged.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving || quantity <= 0}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </>
  );
}
