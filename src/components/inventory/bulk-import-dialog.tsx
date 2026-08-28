"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import type { Category } from "@/lib/db.types";
import {
  INVENTORY_TEMPLATE_HEADERS,
  parseInventoryRows,
  type ParseResult,
} from "@/lib/inventory-import";
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

export function BulkImportDialog({
  open,
  onOpenChange,
  categories,
  existingBarcodes,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  existingBarcodes: string[];
  onImported: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<(ParseResult & { fileName: string }) | null>(null);
  const [importing, setImporting] = useState(false);

  function reset() {
    setParsed(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const aoa = [
      [...INVENTORY_TEMPLATE_HEADERS],
      ["Nike Air Max", "Footwear", "NAM", "9345219023", "42", "Black", 12500, 9000, 10, 3],
      ["Nike Air Max", "Footwear", "NAM", "9345219024", "43", "Black", 12500, 9000, 6, 3],
      ["Classic Tee", "Apparel", "CT", "9345219025", "M", "White", 2450, 1500, 30, 5],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "Inventory");
    XLSX.writeFile(wb, "inventory-import-template.xlsx");
  }

  async function handleFile(file: File) {
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("The file has no sheets");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      const result = parseInventoryRows(rows);

      // Flag barcodes that already exist in the catalog
      const existing = new Set(existingBarcodes.map((b) => b.toLowerCase()));
      const seen = new Set<string>();
      for (const p of result.products) {
        for (const v of p.variants) {
          const key = v.barcode.toLowerCase();
          if (existing.has(key)) {
            result.issues.push({ rowNumber: v.rowNumber, message: `Barcode "${v.barcode}" already exists in catalog` });
            seen.add(key);
          }
        }
      }
      result.products.forEach((p) => {
        p.variants = p.variants.filter((v) => !existing.has(v.barcode.toLowerCase()));
      });
      const cleaned = result.products.filter((p) => p.variants.length > 0);

      setParsed({ products: cleaned, issues: result.issues, fileName: file.name });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the file");
    }
  }

  async function handleImport() {
    if (!parsed || parsed.products.length === 0) return;
    setImporting(true);
    let importedProducts = 0;
    let importedVariants = 0;
    const failures: string[] = [];
    try {
      const categoryIds = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));

      for (const product of parsed.products) {
        try {
          let categoryId: string | null = null;
          if (product.category) {
            const key = product.category.toLowerCase();
            categoryId = categoryIds.get(key) ?? null;
            if (!categoryId) {
              const { data, error } = await supabase
                .from("categories")
                .insert({ id: crypto.randomUUID(), name: product.category })
                .select("id")
                .single();
              if (error) throw error;
              categoryId = (data as { id: string }).id;
              categoryIds.set(key, categoryId);
            }
          }

          const productId = crypto.randomUUID();
          const { error: productError } = await supabase.from("products").insert({
            id: productId,
            name: product.name,
            sku_prefix: product.skuPrefix,
            category_id: categoryId,
            is_active: true,
          });
          if (productError) throw productError;

          const variantRows = product.variants.map((v) => ({
            id: crypto.randomUUID(),
            product_id: productId,
            size: v.size || null,
            color: v.color || null,
            barcode: v.barcode,
            price: v.price,
            cost_price: v.costPrice,
            stock_qty: v.stockQty,
            reorder_level: v.reorderLevel,
            is_active: true,
          }));
          const variantIds = variantRows.map((r) => r.id);
          const { error: variantsError } = await supabase.from("product_variants").insert(variantRows);
          if (variantsError) throw variantsError;

          // Log initial stock as restock transactions so history stays complete
          const stocked = product.variants
            .map((v, i) => ({ qty: v.stockQty, id: variantIds[i] }))
            .filter((v) => v.qty > 0);
          if (stocked.length > 0) {
            const { error: txError } = await supabase.from("inventory_transactions").insert(
              stocked.map((v) => ({
                id: crypto.randomUUID(),
                variant_id: v.id,
                type: "restock" as const,
                quantity: v.qty,
              }))
            );
            if (txError) throw txError;
          }

          importedProducts += 1;
          importedVariants += variantRows.length;
        } catch (err) {
          failures.push(`${product.name}: ${err instanceof Error ? err.message : "insert failed"}`);
        }
      }

      if (failures.length > 0) {
        toast.warning(
          `Imported ${importedVariants} variants across ${importedProducts} products; ${failures.length} product group(s) failed.`,
          { description: failures.slice(0, 3).join(" · ") }
        );
      } else {
        toast.success(`Imported ${importedVariants} variants across ${importedProducts} products`);
      }
      reset();
      onOpenChange(false);
      await onImported();
    } finally {
      setImporting(false);
    }
  }

  const variantCount = parsed?.products.reduce((a, p) => a + p.variants.length, 0) ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import inventory from Excel</DialogTitle>
          <DialogDescription>
            Each row becomes one variant. Rows sharing a product name are grouped into one product.
          </DialogDescription>
        </DialogHeader>

        {!parsed ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border p-8 text-sm text-muted-foreground transition-colors hover:border-ring hover:text-foreground"
            >
              <FileSpreadsheet className="size-8" />
              <span className="font-bold text-foreground">Choose an .xlsx or .csv file</span>
              <span>Product Name · Category · Barcode · Price · Stock Qty…</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <p className="text-center">
              <Button variant="link" size="sm" onClick={downloadTemplate}>
                <Download className="size-4" /> Download template
              </Button>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{parsed.products.length} products</Badge>
              <Badge variant="secondary">{variantCount} variants</Badge>
              {parsed.issues.length > 0 ? (
                <Badge className="bg-[#f7b928]/20 text-[#7a5200] dark:bg-[#f7b928]/15 dark:text-[#f7b928]">
                  <AlertTriangle className="size-3" /> {parsed.issues.length} issues
                </Badge>
              ) : (
                <Badge className="bg-[#31a24c]/15 text-[#1d7a35] dark:bg-[#31a24c]/20 dark:text-[#6fd68a]">
                  <CheckCircle2 className="size-3" /> No issues
                </Badge>
              )}
            </div>

            <div className="max-h-40 overflow-y-auto rounded-lg border bg-muted/40 p-2 text-xs">
              {parsed.products.slice(0, 50).map((p) => (
                <div key={p.name} className="flex items-baseline justify-between gap-2 py-0.5">
                  <span className="truncate font-medium">{p.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {p.category ?? "No category"} · {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                  </span>
                </div>
              ))}
              {parsed.products.length > 50 && (
                <p className="pt-1 text-muted-foreground">+ {parsed.products.length - 50} more…</p>
              )}
            </div>

            {parsed.issues.length > 0 && (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {parsed.issues.map((issue, i) => (
                  <p key={`${issue.rowNumber}-${i}`}>
                    Row {issue.rowNumber}: {issue.message}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {parsed ? (
            <>
              <Button variant="outline" disabled={importing} onClick={reset}>
                Back
              </Button>
              <Button disabled={importing || parsed.products.length === 0} onClick={handleImport}>
                {importing ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                Import {variantCount} variants
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
