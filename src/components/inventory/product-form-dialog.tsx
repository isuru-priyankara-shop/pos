"use client";

import { useRef, useState } from "react";
import { History, ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { Category, ProductVariant } from "@/lib/db.types";
import { variantStatus, type ProductRow } from "@/lib/inventory";
import { formatCurrency } from "@/lib/money";
import { VariantFormDialog } from "@/components/inventory/variant-form-dialog";
import { StockActionDialog } from "@/components/inventory/stock-action-dialog";
import { TransactionsDialog } from "@/components/inventory/transactions-dialog";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const VARIANT_STATUS_BADGE = {
  in_stock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  low: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  out: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  disabled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
} as const;

export function ProductFormDialog({
  open,
  onOpenChange,
  product,
  categories,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ProductRow | null;
  categories: Category[];
  onSaved: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const uploadedPathRef = useRef<string | null>(null);

  async function handleOpenChange(next: boolean) {
    if (!next && uploadedPathRef.current) {
      await supabase.storage.from("product-images").remove([uploadedPathRef.current]);
      uploadedPathRef.current = null;
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && (
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <ProductForm
            key={product?.id ?? "new"}
            product={product}
            categories={categories}
            onSaved={onSaved}
            uploadedPathRef={uploadedPathRef}
            onOpenChange={handleOpenChange}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function ProductForm({
  product,
  categories,
  onSaved,
  uploadedPathRef,
  onOpenChange,
}: {
  product: ProductRow | null;
  categories: Category[];
  onSaved: () => Promise<void>;
  uploadedPathRef: React.MutableRefObject<string | null>;
  onOpenChange: (open: boolean) => void;
}) {
  const { supabase } = useAuth();
  const isNew = !product;

  const [productId] = useState<string>(() => product?.id ?? crypto.randomUUID());
  const [savedId, setSavedId] = useState<string | null>(product?.id ?? null);
  const [name, setName] = useState(product?.name ?? "");
  const [skuPrefix, setSkuPrefix] = useState(product?.sku_prefix ?? "");
  const [categoryId, setCategoryId] = useState<string>(product?.category_id ?? "none");
  const [description, setDescription] = useState(product?.description ?? "");
  const [isActive, setIsActive] = useState(product?.is_active ?? true);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image_url ?? null);
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [variantDialog, setVariantDialog] = useState<{ open: boolean; variant: ProductVariant | null }>({
    open: false,
    variant: null,
  });
  const [stockAction, setStockAction] = useState<{ variant: ProductVariant; action: "restock" | "adjust" } | null>(null);
  const [txVariant, setTxVariant] = useState<ProductVariant | null>(null);

  const effectiveProductId = savedId ?? productId;
  const canEditVariants = !!savedId;

  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    setUploading(true);
    try {
      const clean = file.name.replace(/[^\w.-]/g, "_");
      const path = `${effectiveProductId}/${Date.now()}-${clean}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (error) throw error;
      uploadedPathRef.current = path;
      const url = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      setImageUrl(url);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage() {
    if (!imageUrl) return;
    const path = imageUrl.split("/product-images/")[1];
    if (path) await supabase.storage.from("product-images").remove([path]);
    uploadedPathRef.current = null;
    setImageUrl(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Product name is required");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const { error } = await supabase.from("products").insert({
          id: productId,
          name: name.trim(),
          sku_prefix: skuPrefix.trim() || null,
          category_id: categoryId === "none" ? null : categoryId,
          description: description.trim() || null,
          image_url: imageUrl,
          is_active: isActive,
        });
        if (error) throw error;
        uploadedPathRef.current = null;
        setSavedId(productId);
        toast.success("Product created — now add variants");
      } else {
        const { error } = await supabase
          .from("products")
          .update({
            name: name.trim(),
            sku_prefix: skuPrefix.trim() || null,
            category_id: categoryId === "none" ? null : categoryId,
            description: description.trim() || null,
            image_url: imageUrl,
            is_active: isActive,
          })
          .eq("id", product.id);
        if (error) throw error;
        toast.success("Product updated");
      }
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVariant(v: ProductVariant) {
    const { error } = await supabase
      .from("product_variants")
      .update({ is_active: !v.is_active })
      .eq("id", v.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setVariants((prev) => prev.map((x) => (x.id === v.id ? { ...x, is_active: !v.is_active } : x)));
  }

  async function deleteVariant(v: ProductVariant) {
    const { error } = await supabase.from("product_variants").delete().eq("id", v.id);
    if (error) {
      toast.error(error.message.includes("foreign key") ? "Variant is used in sales — disable it instead" : error.message);
      return;
    }
    setVariants((prev) => prev.filter((x) => x.id !== v.id));
    toast.success("Variant deleted");
  }

  async function refreshVariants() {
    const { data } = await supabase
      .from("product_variants")
      .select("*")
      .eq("product_id", effectiveProductId);
    if (data) setVariants(data as ProductVariant[]);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isNew ? "Add product" : "Edit product"}</DialogTitle>
        <DialogDescription>
          {isNew
            ? "Save the product first, then add size/color variants below."
            : "Manage product details and variants. Stock changes are audit-logged."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="p-name">Product name *</Label>
            <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Classic White Tee" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="p-sku">SKU prefix</Label>
            <Input id="p-sku" value={skuPrefix} onChange={(e) => setSkuPrefix(e.target.value)} placeholder="TS" />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 pb-1">
            <Label className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              Active
            </Label>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Image</Label>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-lg border bg-muted">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="product" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
                e.target.value = "";
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <ImagePlus className="size-4" /> {uploading ? "Uploading…" : imageUrl ? "Replace" : "Upload"}
            </Button>
            {imageUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={handleRemoveImage}>
                Remove
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-base">Variants</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canEditVariants}
            onClick={() => setVariantDialog({ open: true, variant: null })}
            title={canEditVariants ? "" : "Save the product first"}
          >
            <Plus className="size-4" /> Add variant
          </Button>
        </div>

        {!canEditVariants ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            Save the product first to add size/color variants.
          </p>
        ) : variants.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
            No variants yet — click &quot;Add variant&quot;.
          </p>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Size / Color</TableHead>
                  <TableHead>Barcode</TableHead>
                  <TableHead>Price</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {variants.map((v) => {
                  const st = variantStatus(v);
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        {[v.size, v.color].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{v.barcode}</TableCell>
                      <TableCell>{formatCurrency(v.price)}</TableCell>
                      <TableCell>{v.stock_qty}</TableCell>
                      <TableCell>
                        <Badge className={VARIANT_STATUS_BADGE[st]}>
                          {st === "in_stock" ? "In stock" : st === "low" ? "Low" : st === "out" ? "Out" : "Disabled"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setStockAction({ variant: v, action: "restock" })}>
                            Restock
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setStockAction({ variant: v, action: "adjust" })}>
                            Adjust
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setTxVariant(v)}>
                            <History className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setVariantDialog({ open: true, variant: v })}>
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => (v.is_active ? toggleVariant(v) : deleteVariant(v))}
                            title={v.is_active ? "Disable (keep history)" : "Delete (only if never used)"}
                          >
                            {v.is_active ? "Disable" : <Trash2 className="size-3.5" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
          {isNew && !savedId ? "Cancel" : "Close"}
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save product"}
        </Button>
      </DialogFooter>

      <VariantFormDialog
        open={variantDialog.open}
        variant={variantDialog.variant}
        productId={effectiveProductId}
        existingVariants={variants}
        onOpenChange={(o) => !o && setVariantDialog({ open: false, variant: null })}
        onSaved={refreshVariants}
      />

      <StockActionDialog
        target={stockAction}
        onOpenChange={(o) => !o && setStockAction(null)}
        onSaved={refreshVariants}
      />

      <TransactionsDialog variant={txVariant} onOpenChange={(o) => !o && setTxVariant(null)} />
    </>
  );
}
