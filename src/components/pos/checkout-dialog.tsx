"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CreditCard,
  Layers,
  Plus,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Customer, PaymentMethod } from "@/lib/db.types";
import { computePaymentSummary, type PaymentEntry } from "@/lib/pos";
import { formatCurrency, round2, type DiscountMode } from "@/lib/money";
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
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Totals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
}

const QUICK_CASH = [1000, 2000, 5000];

const TENDER_TILES: { method: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { method: "cash", label: "Cash", icon: Banknote },
  { method: "card", label: "Card", icon: CreditCard },
  { method: "qr", label: "Mobile Pay", icon: Smartphone },
  { method: "credit", label: "Credit", icon: CreditCard },
];

function newPayment(method: PaymentMethod, amount: number): PaymentEntry {
  return { id: crypto.randomUUID(), method, amount };
}

export function CheckoutDialog({
  open,
  onOpenChange,
  totals,
  cartDiscount,
  cartDiscountMode,
  onCartDiscountChange,
  onCartDiscountModeChange,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totals: Totals;
  cartDiscount: number;
  cartDiscountMode: DiscountMode;
  onCartDiscountChange: (value: number) => void;
  onCartDiscountModeChange: (mode: DiscountMode) => void;
  onComplete: (customerId: string | null, payments: PaymentEntry[]) => Promise<void>;
}) {
  const [payments, setPayments] = useState<PaymentEntry[]>([
    newPayment("cash", 0),
  ]);
  const [split, setSplit] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
  }

  // Radix only calls onOpenChange for user-initiated changes — programmatic
  // opens (setCheckoutOpen in the parent) never reach handleOpenChange. So
  // reset every payment/customer field whenever the dialog opens, otherwise
  // the previous sale's details linger on the next checkout. The payment
  // amount starts empty — it depends on what the customer hands over.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setBusy(false);
      setSplit(false);
      setPayments([newPayment("cash", 0)]);
      setCustomerQuery("");
      setSelectedCustomer(null);
      setCustomerResults([]);
    }
  }

  useEffect(() => {
    if (!open || customerQuery.trim().length < 2) return;
    let active = true;
    const supabase = createClient();
    const q = `%${customerQuery.trim()}%`;
    supabase
      .from("customers")
      .select("id, name, phone, email")
      .or(`name.ilike.${q},phone.ilike.${q}`)
      .limit(8)
      .then(({ data, error }) => {
        if (active && !error) setCustomerResults((data as Customer[]) ?? []);
      });
    return () => {
      active = false;
    };
  }, [customerQuery, open]);

  function updatePayment(id: string, patch: Partial<PaymentEntry>) {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function pickMethod(method: PaymentMethod) {
    setSplit(false);
    setPayments([newPayment(method, 0)]);
  }

  function addSplitPayment(method: PaymentMethod = "card") {
    setSplit(true);
    setPayments((prev) => [...prev, newPayment(method, 0)]);
  }

  function removePayment(id: string) {
    setPayments((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 1) setSplit(false);
      return next.length > 0 ? next : prev;
    });
  }

  function setQuickCash(amount: number) {
    setPayments((prev) => {
      const cash = prev.filter((p) => p.method === "cash");
      if (cash.length === 0) {
        return [...prev, newPayment("cash", amount)];
      }
      return prev.map((p) => (p.method === "cash" ? { ...p, amount: round2(amount) } : p));
    });
  }

  const summary = computePaymentSummary(payments, totals.grand_total);
  const valid =
    payments.length > 0 &&
    payments.every((p) => p.amount > 0) &&
    summary.shortfall <= 0.001 &&
    !busy;

  async function handleConfirm() {
    if (!valid) return;
    setBusy(true);
    try {
      await onComplete(selectedCustomer?.id ?? null, payments);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && handleOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>
            Choose tender, then confirm to record the sale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Prominent total */}
          <div className="rounded-lg border bg-primary/5 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Amount due
            </p>
            <p className="text-3xl font-semibold tracking-tight text-foreground">
              {formatCurrency(totals.grand_total)}
            </p>
          </div>

          {/* Tender tiles */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TENDER_TILES.map((tile) => {
              const Icon = tile.icon;
              const active = !split && payments[0]?.method === tile.method;
              return (
                <button
                  key={tile.method}
                  type="button"
                  onClick={() => pickMethod(tile.method)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                  {tile.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => addSplitPayment("card")}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-lg border bg-card p-3 text-sm font-medium transition-colors",
                split
                  ? "border-primary bg-primary/10 text-primary"
                  : "text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              <Layers className="size-5" />
              Split bill
            </button>
          </div>

          <Separator />

          {/* Customer attach */}
          <div className="space-y-2">
            <Label>Customer (optional)</Label>
            {selectedCustomer ? (
              <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{selectedCustomer.name}</p>
                  <p className="text-xs text-muted-foreground">{selectedCustomer.phone}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>
                  <X className="size-4" /> Clear
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search by name or phone…"
                  value={customerQuery}
                  onChange={(e) => {
                    setCustomerQuery(e.target.value);
                    if (e.target.value.trim().length < 2) setCustomerResults([]);
                  }}
                />
                {customerResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded-lg border">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerResults([]);
                        }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{c.name}</span>
                        <span className="text-xs text-muted-foreground">{c.phone ?? ""}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Payments</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSplitPayment("card")}
              >
                <Plus className="size-4" /> Split
              </Button>
            </div>
            {payments.map((p) => (
              <div key={p.id} className="flex min-w-0 items-center gap-2">
                <Select
                  value={p.method}
                  onValueChange={(v) => updatePayment(p.id, { method: v as PaymentMethod })}
                >
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="qr">QR</SelectItem>
                    <SelectItem value="credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={p.amount === 0 ? "" : p.amount}
                  placeholder="0.00"
                  className="min-w-0 flex-1"
                  onChange={(e) =>
                    updatePayment(p.id, { amount: round2(parseFloat(e.target.value) || 0) })
                  }
                />
                {payments.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removePayment(p.id)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setQuickCash(totals.grand_total)}
              >
                Exact cash
              </Button>
              {QUICK_CASH.map((n) => (
                <Button key={n} type="button" variant="outline" size="sm" onClick={() => setQuickCash(n)}>
                  {n.toLocaleString()}
                </Button>
              ))}
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Sale discount</span>
              <div className="flex items-center gap-1">
                <Select
                  value={cartDiscountMode}
                  onValueChange={(v) => onCartDiscountModeChange(v as DiscountMode)}
                  disabled={busy}
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
                  onChange={(e) =>
                    onCartDiscountChange(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatCurrency(totals.subtotal)}</span>
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
              <div className="flex justify-between text-base font-semibold">
                <span>Paid</span>
                <span className="text-primary">{formatCurrency(summary.totalPaid)}</span>
              </div>
              {summary.shortfall > 0.001 && (
                <p className="text-right text-destructive">
                  Short {formatCurrency(summary.shortfall)}
                </p>
              )}
              {summary.change > 0 && (
                <p className="flex justify-between">
                  <span className="text-muted-foreground">Change</span>
                  <span className="font-semibold text-primary">
                    {formatCurrency(summary.change)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!valid} size="lg" className="h-10">
            {busy ? "Processing…" : `Charge ${formatCurrency(totals.grand_total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
