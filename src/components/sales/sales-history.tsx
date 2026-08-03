"use client";

import { useEffect, useMemo, useState } from "react";
import { Eye } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { createClient } from "@/lib/supabase/client";
import type { Payment, ProductVariant, SaleItem } from "@/lib/db.types";
import { needsManagerApproval } from "@/lib/void";
import { formatCurrency } from "@/lib/money";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface SaleRow {
  id: string;
  sale_date: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  status: "completed" | "refunded" | "void";
  created_offline: boolean;
  void_reason: string | null;
  items: (SaleItem & {
    variant: (ProductVariant & { product: { name: string } | null }) | null;
  })[];
  payments: Payment[];
  customer: { name: string; phone: string | null } | null;
  cashier: { full_name: string } | null;
}

const STATUS_STYLE: Record<SaleRow["status"], string> = {
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  refunded: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  void: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function SalesHistory({ initialSales }: { initialSales: SaleRow[] }) {
  const { profile } = useAuth();
  const [sales, setSales] = useState<SaleRow[]>(initialSales);
  const [threshold, setThreshold] = useState(0);
  const [selected, setSelected] = useState<SaleRow | null>(null);
  const [reason, setReason] = useState("");
  const [managerEmail, setManagerEmail] = useState("");
  const [managerPassword, setManagerPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("app_settings")
      .select("key, value")
      .then(({ data }) => {
        const t = (data ?? []).find((s) => (s as { key: string }).key === "void_threshold");
        setThreshold(parseFloat((t as { value: string } | undefined)?.value ?? "0") || 0);
      });
  }, []);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase
      .from("sales")
      .select(
        "*, items:sale_items(*, variant:product_variants(*, product:products(name))), payments(*), customer:customers(name, phone), cashier:profiles(full_name)"
      )
      .order("sale_date", { ascending: false })
      .limit(200);
    if (data) setSales(data as unknown as SaleRow[]);
  }

  const approvalNeeded = useMemo(
    () =>
      selected
        ? needsManagerApproval(profile?.role, selected.grand_total, threshold)
        : false,
    [selected, profile, threshold]
  );

  async function handleVoid(status: "void" | "refunded") {
    if (!selected) return;
    const body: Record<string, string> = { status, reason };
    if (approvalNeeded) {
      body.manager_email = managerEmail.trim();
      body.manager_password = managerPassword;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/sales/${selected.id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Void failed");
      toast.success(status === "void" ? "Sale voided — stock restored" : "Sale refunded — stock restored");
      setSelected(null);
      setReason("");
      setManagerEmail("");
      setManagerPassword("");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Void failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sales</h1>
        <p className="text-sm text-muted-foreground">
          {approvalNeeded
            ? `Voids above ${formatCurrency(threshold)} require manager sign-off.`
            : "Recent sales. Void/refund restores stock automatically."}
        </p>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {sales.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No sales yet. Ring one up at the Register.
          </p>
        ) : (
          sales.map((s) => (
            <div key={s.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {new Date(s.sale_date).toLocaleString()}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.customer?.name ?? "Walk-in"} ·{" "}
                    {s.items.reduce((acc, i) => acc + i.quantity, 0)} item
                    {s.items.reduce((acc, i) => acc + i.quantity, 0) === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold">
                  {formatCurrency(s.grand_total)}
                </p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={STATUS_STYLE[s.status]}>{s.status}</Badge>
                  {s.created_offline && (
                    <Badge variant="outline" className="text-[10px]">
                      offline
                    </Badge>
                  )}
                  {s.payments.length > 0 && (
                    <span className="text-xs uppercase text-muted-foreground">
                      {s.payments.map((p) => p.method).join(", ")}
                    </span>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
                  <Eye className="size-4" /> View
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No sales yet. Ring one up at the Register.
                </TableCell>
              </TableRow>
            ) : (
              sales.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap text-sm">
                    {new Date(s.sale_date).toLocaleString()}
                    {s.created_offline && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        offline
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{s.customer?.name ?? "Walk-in"}</TableCell>
                  <TableCell>{s.items.reduce((acc, i) => acc + i.quantity, 0)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(s.grand_total)}</TableCell>
                  <TableCell className="text-sm">
                    {s.payments.map((p) => p.method).join(", ") || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_STYLE[s.status]}>{s.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(s)}>
                      <Eye className="size-4" /> View
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* ---------- Detail / void dialog ---------- */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && !busy && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Sale details</DialogTitle>
            <DialogDescription>
              {selected ? new Date(selected.sale_date).toLocaleString() : ""}
            </DialogDescription>
          </DialogHeader>

          {selected && (
            <div className="space-y-4">
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Receipt</span>
                  <span className="font-mono">{selected.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cashier</span>
                  <span>{selected.cashier?.full_name ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Customer</span>
                  <span>{selected.customer?.name ?? "Walk-in"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge className={STATUS_STYLE[selected.status]}>{selected.status}</Badge>
                </div>
              </div>

              <div className="space-y-1.5 rounded-lg border p-3 text-sm">
                {selected.items.map((i) => (
                  <div key={i.id} className="flex justify-between gap-2">
                    <span>
                      {i.variant?.product?.name ?? "Unknown item"}
                      {i.variant ? ` (${[i.variant.size, i.variant.color].filter(Boolean).join(" · ")})` : ""}
                      <span className="text-muted-foreground"> × {i.quantity}</span>
                    </span>
                    <span>{formatCurrency(i.line_total)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(selected.subtotal)}</span>
                </div>
                {selected.discount_total > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Discount</span>
                    <span>-{formatCurrency(selected.discount_total)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatCurrency(selected.tax_total)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>{formatCurrency(selected.grand_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payments</span>
                  <span>
                    {selected.payments.map((p) => `${p.method} ${formatCurrency(p.amount)}`).join(", ") || "—"}
                  </span>
                </div>
              </div>

              {selected.void_reason && (
                <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
                  Reason: {selected.void_reason}
                </p>
              )}

              {selected.status === "completed" && (
                <div className="space-y-3 rounded-lg border border-dashed p-3">
                  <Label htmlFor="void-reason">Reason (optional)</Label>
                  <Textarea
                    id="void-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. customer changed mind"
                  />
                  {approvalNeeded && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="mgr-email">Manager email</Label>
                        <Input
                          id="mgr-email"
                          type="email"
                          value={managerEmail}
                          onChange={(e) => setManagerEmail(e.target.value)}
                          placeholder="manager@yourstore.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="mgr-password">Manager password</Label>
                        <Input
                          id="mgr-password"
                          type="password"
                          value={managerPassword}
                          onChange={(e) => setManagerPassword(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => handleVoid("void")}
                      className="flex-1"
                    >
                      Void sale
                    </Button>
                    <Button disabled={busy} onClick={() => handleVoid("refunded")} className="flex-1">
                      Refund
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
