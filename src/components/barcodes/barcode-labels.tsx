"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import { Printer, Search } from "lucide-react";
import type { ProductRow } from "@/lib/inventory";
import { formatCurrency } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface VariantRow {
  variantId: string;
  productName: string;
  productSku: string | null;
  size: string | null;
  color: string | null;
  barcode: string;
  price: number;
}

/** Bar width scaled so the barcode fits a 40mm label no matter the length. */
function barWidthFor(value: string): number {
  const modules = value.length * 11 + 8;
  return Math.max(0.6, Math.min(2, 135 / modules));
}

function BarcodeSvg({ value }: { value: string }) {
  const ref = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      JsBarcode(el, value, {
        format: "CODE128",
        width: barWidthFor(value),
        height: 30,
        margin: 0,
        displayValue: false,
      });
    } catch {
      // Value cannot be encoded — the text underneath still prints.
    }
  }, [value]);
  return <svg ref={ref} className="max-h-7 w-auto max-w-full" />;
}

function LabelSticker({ row }: { row: VariantRow }) {
  return (
    <div className="flex w-[150px] flex-col border border-dashed border-black/60 p-1 text-black">
      <p className="truncate text-[10px] font-semibold leading-tight">{row.productName}</p>
      <p className="truncate text-[10px] leading-tight">
        {[row.size, row.color].filter(Boolean).join(" · ") || "—"}
      </p>
      <div className="flex flex-1 items-center justify-center">
        <BarcodeSvg value={row.barcode} />
      </div>
      <div className="flex items-end justify-between gap-1">
        <span className="truncate font-mono text-[9px]">{row.barcode}</span>
        <span className="shrink-0 text-[9px] font-semibold">{formatCurrency(row.price)}</span>
      </div>
    </div>
  );
}

export function BarcodeLabels({ initialProducts }: { initialProducts: ProductRow[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copies, setCopies] = useState(1);

  const rows = useMemo<VariantRow[]>(
    () =>
      initialProducts.flatMap((p) =>
        p.variants
          .filter((v) => v.is_active)
          .map((v) => ({
            variantId: v.id,
            productName: p.name,
            productSku: p.sku_prefix,
            size: v.size,
            color: v.color,
            barcode: v.barcode,
            price: v.price,
          }))
      ),
    [initialProducts]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        (r.productSku ?? "").toLowerCase().includes(q) ||
        (r.size ?? "").toLowerCase().includes(q) ||
        (r.color ?? "").toLowerCase().includes(q) ||
        r.barcode.toLowerCase().includes(q)
    );
  }, [rows, search]);

  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(r.variantId)),
    [rows, selected]
  );

  const printLabels = useMemo(
    () => selectedRows.flatMap((r) => Array.from({ length: copies }, () => r)),
    [selectedRows, copies]
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.variantId));

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filtered.forEach((r) => next.delete(r.variantId));
      } else {
        filtered.forEach((r) => next.add(r.variantId));
      }
      return next;
    });
  }

  function toggleOne(variantId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Barcode labels</h1>
          <p className="text-sm text-muted-foreground">
            Select variants and print sticky barcode labels. Admins only.
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Label htmlFor="copies" className="text-sm">
            Copies
          </Label>
          <Input
            id="copies"
            type="number"
            min={1}
            max={99}
            value={copies}
            onChange={(e) => setCopies(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
            className="w-16"
          />
          <Button className="flex-1 sm:flex-none" onClick={() => window.print()} disabled={printLabels.length === 0}>
            <Printer className="size-4" /> Print labels
            {printLabels.length > 0 ? ` (${printLabels.length})` : ""}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, size, color or barcode…"
            className="pl-8"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="sm:hidden"
          onClick={toggleAll}
        >
          {allFilteredSelected ? "Clear all" : "Select all"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
          Clear selection
        </Button>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No variants match.
          </p>
        ) : (
          filtered.map((r) => (
            <div key={r.variantId} className="flex items-start gap-3 rounded-lg border bg-card p-3">
              <Checkbox
                checked={selected.has(r.variantId)}
                onCheckedChange={() => toggleOne(r.variantId)}
                className="mt-0.5"
                aria-label={`Select ${r.productName} ${r.size ?? ""} ${r.color ?? ""}`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {[r.productSku, [r.size, r.color].filter(Boolean).join(" · ")]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
                <p className="mt-1 truncate font-mono text-xs">{r.barcode}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold">
                {formatCurrency(r.price)}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allFilteredSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all filtered variants"
                />
              </TableHead>
              <TableHead>Product</TableHead>
              <TableHead>Size / Color</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead className="text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No variants match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r) => (
                <TableRow key={r.variantId}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(r.variantId)}
                      onCheckedChange={() => toggleOne(r.variantId)}
                      aria-label={`Select ${r.productName} ${r.size ?? ""} ${r.color ?? ""}`}
                    />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{r.productName}</p>
                    <p className="text-xs text-muted-foreground">{r.productSku ?? ""}</p>
                  </TableCell>
                  <TableCell>{[r.size, r.color].filter(Boolean).join(" · ") || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{r.barcode}</TableCell>
                  <TableCell className="text-right">{formatCurrency(r.price)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {selectedRows.length > 0 && (
        <div className="rounded-lg border bg-card p-4 print:hidden">
          <h2 className="mb-2 text-sm font-semibold">Preview</h2>
          <div className="flex max-h-72 flex-wrap content-start gap-2 overflow-auto">
            {selectedRows.map((r) => (
              <LabelSticker key={`preview-${r.variantId}`} row={r} />
            ))}
          </div>
        </div>
      )}

      {/* Print-only sheet: everything else is hidden via @media print rules */}
      <div
        id="barcode-print"
        className="hidden flex-wrap content-start gap-2 bg-white p-2 print:flex"
      >
        {printLabels.map((r, i) => (
          <LabelSticker key={`${r.variantId}-${i}`} row={r} />
        ))}
      </div>
    </div>
  );
}
