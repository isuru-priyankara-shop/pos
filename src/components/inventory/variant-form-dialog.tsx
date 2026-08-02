"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { ProductVariant } from "@/lib/db.types";
import { isVariantBarcodeUsed, validateVariantForm, type VariantForm } from "@/lib/inventory";
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

export function VariantFormDialog({
  open,
  variant,
  productId,
  existingVariants,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  variant: ProductVariant | null;
  productId: string;
  existingVariants: ProductVariant[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="sm:max-w-md">
          <VariantForm
            key={variant?.id ?? "new"}
            variant={variant}
            productId={productId}
            existingVariants={existingVariants}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function VariantForm({
  variant,
  productId,
  existingVariants,
  onOpenChange,
  onSaved,
}: {
  variant: ProductVariant | null;
  productId: string;
  existingVariants: ProductVariant[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const [form, setForm] = useState<VariantForm>({
    size: variant?.size ?? "",
    color: variant?.color ?? "",
    barcode: variant?.barcode ?? "",
    price: variant?.price ?? 0,
    cost_price: variant?.cost_price ?? null,
    reorder_level: variant?.reorder_level ?? 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const errs = validateVariantForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors({ ...errs });
      return;
    }
    if (isVariantBarcodeUsed(form.barcode, existingVariants, variant?.id)) {
      setErrors({ barcode: "Barcode already used by another variant of this product" });
      return;
    }
    setSaving(true);
    try {
      if (variant) {
        const { error } = await supabase
          .from("product_variants")
          .update({
            size: form.size.trim() || null,
            color: form.color.trim() || null,
            barcode: form.barcode.trim(),
            price: form.price,
            cost_price: form.cost_price,
            reorder_level: form.reorder_level,
          })
          .eq("id", variant.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_variants").insert({
          id: crypto.randomUUID(),
          product_id: productId,
          size: form.size.trim() || null,
          color: form.color.trim() || null,
          barcode: form.barcode.trim(),
          price: form.price,
          cost_price: form.cost_price,
          stock_qty: 0,
          reorder_level: form.reorder_level,
          is_active: true,
        });
        if (error) throw error;
      }
      await onSaved();
      toast.success(variant ? "Variant updated" : "Variant added — set initial stock with Restock");
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      if (msg.toLowerCase().includes("duplicate") || msg.toLowerCase().includes("barcode")) {
        setErrors({ barcode: "Barcode already exists in the database" });
      } else {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{variant ? "Edit variant" : "Add variant"}</DialogTitle>
        <DialogDescription>Size/color are optional — at least one is required.</DialogDescription>
      </DialogHeader>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="v-size">Size</Label>
          <Input id="v-size" value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="M" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v-color">Color</Label>
          <Input id="v-color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="White" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v-barcode">Barcode *</Label>
          <Input id="v-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="8901234567890" />
          {errors.barcode ? <p className="text-xs text-red-500">{errors.barcode}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="v-price">Price (LKR) *</Label>
          <Input
            id="v-price"
            type="number"
            min="0"
            step="0.01"
            value={form.price || ""}
            onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
            placeholder="2500"
          />
          {errors.price ? <p className="text-xs text-red-500">{errors.price}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="v-cost">Cost price (LKR)</Label>
          <Input
            id="v-cost"
            type="number"
            min="0"
            step="0.01"
            value={form.cost_price ?? ""}
            onChange={(e) => setForm({ ...form, cost_price: e.target.value === "" ? null : Number(e.target.value) })}
            placeholder="1500"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="v-reorder">Reorder level</Label>
          <Input
            id="v-reorder"
            type="number"
            min="0"
            step="1"
            value={form.reorder_level || ""}
            onChange={(e) => setForm({ ...form, reorder_level: Number(e.target.value) })}
            placeholder="5"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save variant"}
        </Button>
      </DialogFooter>
    </>
  );
}
