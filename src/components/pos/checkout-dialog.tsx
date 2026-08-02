"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Customer, PaymentMethod } from "@/lib/db.types";
import { computePaymentSummary, type PaymentEntry } from "@/lib/pos";
import { formatCurrency, round2 } from "@/lib/money";
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

interface Totals {
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
}

const QUICK_CASH = [1000, 2000, 5000];

export function CheckoutDialog({
  open,
  onOpenChange,
  totals,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  totals: Totals;
  onComplete: (customerId: string | null, payments: PaymentEntry[]) => Promise<void>;
}) {
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { id: crypto.randomUUID(), method: "cash", amount: totals.grand_total },
  ]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);

  function handleOpenChange(next: boolean) {
    if (next) {
      setPayments([{ id: crypto.randomUUID(), method: "cash", amount: totals.grand_total }]);
      setCustomerQuery("");
      setSelectedCustomer(null);
      setCustomerResults([]);
    }
    onOpenChange(next);
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

  function addPayment() {
    setPayments((prev) => [...prev, { id: crypto.randomUUID(), method: "card", amount: 0 }]);
  }

  function removePayment(id: string) {
    setPayments((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }

  function setQuickCash(amount: number) {
    setPayments((prev) => {
      const cash = prev.filter((p) => p.method === "cash");
      if (cash.length === 0) {
        return [...prev, { id: crypto.randomUUID(), method: "cash", amount }];
      }
      return prev.map((p) =>
        p.method === "cash" ? { ...p, amount: amount === totals.grand_total ? round2(amount) : amount } : p
      );
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
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && handleOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Checkout</DialogTitle>
          <DialogDescription>Select customer (optional), payments, then confirm.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
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
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(totals.grand_total)}</span>
            </div>
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
              <Button type="button" variant="outline" size="sm" onClick={addPayment}>
                <Plus className="size-4" /> Split payment
              </Button>
            </div>
            {payments.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <Select
                  value={p.method}
                  onValueChange={(v) => updatePayment(p.id, { method: v as PaymentMethod })}
                >
                  <SelectTrigger className="w-28">
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
                  onChange={(e) => updatePayment(p.id, { amount: round2(parseFloat(e.target.value) || 0) })}
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
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span>{formatCurrency(summary.totalPaid)}</span>
            </div>
            {summary.shortfall > 0.001 && (
              <p className="text-sm text-destructive">
                Short {formatCurrency(summary.shortfall)}
              </p>
            )}
            {summary.change > 0 && (
              <p className="text-sm text-emerald-600">Change {formatCurrency(summary.change)}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!valid} size="lg">
            {busy ? "Processing…" : `Confirm ${formatCurrency(totals.grand_total)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
