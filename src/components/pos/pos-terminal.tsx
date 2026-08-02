"use client";

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { Camera, Minus, Plus, Search, Shirt, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { Category, ProductWithVariants } from "@/lib/db.types";
import { buildSalePayload, cartToTotalsInput, cartLineTotals, type CartLine, type PaymentEntry } from "@/lib/pos";
import { computeTotals, formatCurrency, resolveDiscount, round2 } from "@/lib/money";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { CheckoutDialog } from "@/components/pos/checkout-dialog";
import { ReceiptView, type ReceiptData } from "@/components/pos/receipt-view";
import { CameraScanner } from "@/components/pos/camera-scanner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

export function PosTerminal() {
  const { supabase, user, profile } = useAuth();
  const [products, setProducts] = useState<ProductWithVariants[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [cartDiscountMode, setCartDiscountMode] = useState<"fixed" | "percent">("fixed");
  const [pickerProduct, setPickerProduct] = useState<ProductWithVariants | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const scanInputRef = useRef<HTMLInputElement>(null);

  const loadData = useRef<() => Promise<void>>(async () => {
    const [{ data: prods }, { data: cats }, { data: settings }] = await Promise.all([
      supabase
        .from("products")
        .select("*, variants:product_variants!inner(*)")
        .eq("is_active", true)
        .eq("variants.is_active", true)
        .order("name"),
      supabase.from("categories").select("*").order("name"),
      supabase.from("app_settings").select("key, value"),
    ]);
    if (prods) setProducts(prods as unknown as ProductWithVariants[]);
    if (cats) setCategories(cats as Category[]);
    const tax = (settings ?? []).find((s) => (s as { key: string }).key === "tax_rate");
    setTaxRate(parseFloat((tax as { value: string } | undefined)?.value ?? "0") || 0);
  });

  useEffect(() => {
    loadData.current();
  }, []);

  function addVariant(variantId: string) {
    const product = products.find((p) => p.variants?.some((v) => v.id === variantId));
    const variant = product?.variants?.find((v) => v.id === variantId);
    if (!product || !variant) {
      toast.error("Variant not found");
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.variant.id === variantId);
      const nextQty = (existing?.quantity ?? 0) + 1;
      if (nextQty > variant.stock_qty) {
        toast.warning(`Only ${variant.stock_qty} in stock for this variant`);
        return prev;
      }
      if (existing) {
        return prev.map((l) => (l.variant.id === variantId ? { ...l, quantity: nextQty } : l));
      }
      return [...prev, { variant: { ...variant, product_name: product.name }, quantity: 1, line_discount: 0, discount_type: "fixed" as const }];
    });
  }

  const addByBarcode = useCallback(
    (barcode: string) => {
      for (const p of products) {
        const v = p.variants?.find((v) => v.barcode === barcode);
        if (v) {
          addVariant(v.id);
          return;
        }
      }
      toast.error(`Barcode ${barcode} not found`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products]
  );

  useBarcodeScanner(addByBarcode, !checkoutOpen && !cameraOpen);

  function changeQty(variantId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => {
          if (l.variant.id !== variantId) return l;
          const next = l.quantity + delta;
          if (next > l.variant.stock_qty) {
            toast.warning(`Only ${l.variant.stock_qty} in stock`);
            return l;
          }
          return { ...l, quantity: Math.max(1, next) };
        })
        .filter((l) => l.quantity > 0)
    );
  }

  function setDiscount(variantId: string, value: number, mode: "fixed" | "percent") {
    setCart((prev) =>
      prev.map((l) =>
        l.variant.id === variantId
          ? { ...l, line_discount: Math.max(0, round2(value)), discount_type: mode }
          : l
      )
    );
  }

  function removeLine(variantId: string) {
    setCart((prev) => prev.filter((l) => l.variant.id !== variantId));
  }

  const totals = useMemo(() => {
    const input = cartToTotalsInput(cart);
    const subtotal = round2(input.reduce((acc, l) => acc + l.unit_price * l.quantity, 0));
    const lineDiscounts = round2(input.reduce((acc, l) => acc + l.line_discount, 0));
    const effective = resolveDiscount(Math.max(0, subtotal - lineDiscounts), cartDiscount, cartDiscountMode);
    return computeTotals(input, taxRate, effective);
  }, [cart, taxRate, cartDiscount, cartDiscountMode]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      if (!q) return true;
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.sku_prefix?.toLowerCase().includes(q)) return true;
      if (p.variants?.some((v) =>
        v.barcode.toLowerCase().includes(q) ||
        v.color?.toLowerCase().includes(q) ||
        v.size?.toLowerCase().includes(q)
      )) return true;
      return false;
    });
  }, [products, search, categoryFilter]);

  async function handleComplete(customerId: string | null, payments: PaymentEntry[]) {
    if (!user) throw new Error("Not signed in");
    const payload = buildSalePayload(cart, customerId, user.id, taxRate, payments, false, cartDiscount, cartDiscountMode);
    const { error } = await supabase.rpc("record_sale", {
      p_sale: payload.sale,
      p_items: payload.items,
      p_payments: payload.payments,
    });
    if (error) throw new Error(error.message);

    let customerName: string | null = null;
    if (customerId) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name")
        .eq("id", customerId)
        .single();
      customerName = (customer as { name: string } | null)?.name ?? null;
    }

    setReceipt({
      saleId: payload.sale.id,
      saleDate: payload.sale.sale_date,
      cashierName: profile?.full_name ?? "Cashier",
      customerName,
      items: cart.map((l) => {
        const line = cartLineTotals(l);
        return {
          name: l.variant.product_name,
          size: l.variant.size,
          color: l.variant.color,
          quantity: l.quantity,
          unit_price: line.unit_price,
          line_discount: line.line_discount,
          line_total: line.line_total,
        };
      }),
      subtotal: payload.sale.subtotal,
      discount_total: payload.sale.discount_total,
      tax_total: payload.sale.tax_total,
      grand_total: payload.sale.grand_total,
      payments,
      change: Math.max(0, payments.filter((p) => p.method === "cash").reduce((a, p) => a + p.amount, 0) - payload.sale.grand_total),
    });
    setCart([]);
    setCartDiscount(0);
    setCheckoutOpen(false);
    await loadData.current();
    toast.success("Sale recorded");
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] gap-4 p-4">
      {/* ---------- Left: catalog ---------- */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-2">
          <form
            className="relative flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              const input = scanInputRef.current;
              if (input) {
                addByBarcode(input.value.trim());
                input.value = "";
              }
            }}
          >
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={scanInputRef}
              autoFocus
              className="pl-9"
              placeholder="Scan barcode or search…"
              onChange={(e) => setSearch(e.target.value)}
            />
          </form>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCameraOpen(true)}
            title="Scan with camera"
          >
            <Camera className="size-4" />
          </Button>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto pb-4 md:grid-cols-3 xl:grid-cols-4">
          {filteredProducts.length === 0 && (
            <p className="col-span-full py-16 text-center text-muted-foreground">
              No products match. Ask a manager to add them in Inventory.
            </p>
          )}
          {filteredProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPickerProduct(p)}
              className="flex flex-col rounded-xl border bg-card p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="mb-2 flex h-20 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt={p.name} className="h-full w-full rounded-lg object-cover" />
                ) : (
                  <Shirt className="size-8" />
                )}
              </div>
              <p className="line-clamp-1 text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {(p.variants ?? []).length} variant{(p.variants ?? []).length === 1 ? "" : "s"}
              </p>
              <p className="mt-1 text-sm font-semibold">
                {formatCurrency(Math.min(...(p.variants ?? []).map((v) => v.price)))}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- Right: cart ---------- */}
      <div className="flex w-80 shrink-0 flex-col rounded-xl border bg-card sm:w-96">
        <div className="flex items-center justify-between border-b p-3">
          <h2 className="font-semibold">Current sale</h2>
          {cart.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => { setCart([]); setCartDiscount(0); }}>
              Clear
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {cart.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Scan an item or tap a product to begin.
            </p>
          ) : (
            cart.map((l) => (
              <div key={l.variant.id} className="space-y-2 rounded-lg border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{l.variant.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[l.variant.size, l.variant.color].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="-m-1 size-6" onClick={() => removeLine(l.variant.id)}>
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="size-7" onClick={() => changeQty(l.variant.id, -1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-8 text-center text-sm">{l.quantity}</span>
                    <Button variant="outline" size="icon" className="size-7" onClick={() => changeQty(l.variant.id, 1)}>
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
                    onValueChange={(v) => setDiscount(l.variant.id, l.line_discount, v as "fixed" | "percent")}
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
                    onChange={(e) => setDiscount(l.variant.id, parseFloat(e.target.value) || 0, l.discount_type)}
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
                onValueChange={(v) => setCartDiscountMode(v as "fixed" | "percent")}
                disabled={cart.length === 0}
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
                onChange={(e) => setCartDiscount(Math.max(0, round2(parseFloat(e.target.value) || 0)))}
                disabled={cart.length === 0}
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
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatCurrency(totals.grand_total)}</span>
          </div>
          <Button
            size="lg"
            className="mt-3 w-full"
            disabled={cart.length === 0}
            onClick={() => setCheckoutOpen(true)}
          >
            Charge {formatCurrency(totals.grand_total)}
          </Button>
        </div>
      </div>

      {/* ---------- Variant picker ---------- */}
      <Dialog open={!!pickerProduct} onOpenChange={(o) => !o && setPickerProduct(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pickerProduct?.name}</DialogTitle>
            <DialogDescription>Select a size / color to add to the sale.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            {pickerProduct?.variants?.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  addVariant(v.id);
                  setPickerProduct(null);
                }}
                className="flex flex-col rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
              >
                <span className="text-sm font-medium">
                  {[v.size, v.color].filter(Boolean).join(" · ") || "Default"}
                </span>
                <span className="text-sm font-semibold">{formatCurrency(v.price)}</span>
                <span className={v.stock_qty <= v.reorder_level ? "text-xs text-amber-600" : "text-xs text-muted-foreground"}>
                  {v.stock_qty} in stock
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ---------- Camera scanner ---------- */}
      <CameraScanner open={cameraOpen} onOpenChange={setCameraOpen} onScan={addByBarcode} />

      {/* ---------- Checkout ---------- */}
      <CheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        totals={totals}
        onComplete={handleComplete}
      />

      {/* ---------- Receipt ---------- */}
      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sale complete</DialogTitle>
            <DialogDescription>Print the receipt for the customer.</DialogDescription>
          </DialogHeader>
          <div id="receipt-print">
            {receipt && <ReceiptView receipt={receipt} />}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              Print receipt
            </Button>
            <Button onClick={() => setReceipt(null)}>New sale</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
