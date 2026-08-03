"use client";

import { useEffect, useState } from "react";
import { RefreshCw, TrendingDown } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import {
  aggregateSales,
  bestSellers,
  completedSaleIds,
  dailyBreakdown,
  paymentSplit,
  periodRangeISO,
  slowMovers,
  type ReportItemRow,
  type ReportPaymentRow,
  type ReportPeriod,
  type ReportSaleRow,
  type ReportVariantRow,
} from "@/lib/reporting";
import { formatCurrency } from "@/lib/money";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
  { value: "lastMonth", label: "Last month" },
  { value: "custom", label: "Custom range" },
];

interface ReportData {
  sales: ReportSaleRow[];
  items: ReportItemRow[];
  payments: ReportPaymentRow[];
  variants: ReportVariantRow[];
}

export function ReportsManager() {
  const { supabase } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  function changePeriod(p: ReportPeriod) {
    setPeriod(p);
    setRefreshKey((k) => k + 1);
  }

  async function fetchReport(): Promise<ReportData> {
    let fromISO: string;
    let toISO: string;
    if (period === "custom") {
      if (!customFrom || !customTo) return { sales: [], items: [], payments: [], variants: [] };
      if (customFrom > customTo) throw new Error("From date must be before To date");
      fromISO = new Date(`${customFrom}T00:00:00`).toISOString();
      toISO = new Date(new Date(`${customTo}T00:00:00`).getTime() + 86400000).toISOString();
    } else {
      ({ fromISO, toISO } = periodRangeISO(period));
    }

    const { data: sales, error: salesErr } = await supabase
      .from("sales")
      .select("id, status, sale_date")
      .gte("sale_date", fromISO)
      .lt("sale_date", toISO);
    if (salesErr) throw salesErr;
    const saleRows = (sales ?? []) as ReportSaleRow[];

    const items: ReportItemRow[] = [];
    const payments: ReportPaymentRow[] = [];
    const ids = saleRows.map((s) => s.id);
    for (let i = 0; i < ids.length; i += 900) {
      const chunk = ids.slice(i, i + 900);
      const [{ data: itemRows, error: itemErr }, { data: payRows, error: payErr }] = await Promise.all([
        supabase
          .from("sale_items")
          .select(
            "id, sale_id, variant_id, quantity, unit_price, line_discount, line_total, cost_price, variant:product_variants(id, size, color, product:products(id, name, sku_prefix))"
          )
          .in("sale_id", chunk),
        supabase.from("payments").select("method, amount, status").in("sale_id", chunk),
      ]);
      if (itemErr) throw itemErr;
      if (payErr) throw payErr;
      items.push(...((itemRows ?? []) as unknown as ReportItemRow[]));
      payments.push(...((payRows ?? []) as ReportPaymentRow[]));
    }

    const { data: variants, error: variantsErr } = await supabase
      .from("product_variants")
      .select("id, size, color, stock_qty, is_active, product:products(name, sku_prefix)")
      .eq("is_active", true);
    if (variantsErr) throw variantsErr;

    return {
      sales: saleRows,
      items,
      payments,
      variants: (variants ?? []) as unknown as ReportVariantRow[],
    };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await fetchReport();
        if (!cancelled) {
          setData(d);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load report");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, customFrom, customTo, refreshKey]);

  const loading = data === null;
  const totals = data ? aggregateSales(data.sales, data.items) : null;
  const completed = data ? completedSaleIds(data.sales) : new Set<string>();
  const sellers = data ? bestSellers(data.items, completed, 10) : [];
  const movers = data ? slowMovers(data.variants, data.items, completed) : [];
  const split = data ? paymentSplit(data.payments) : [];
  const daily = data ? dailyBreakdown(data.sales, data.items, 14) : [];
  const maxDaily = Math.max(1, ...daily.map((d) => d.revenue));

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Sales reporting</h1>
          <p className="text-sm text-muted-foreground">Completed sales only; voids counted separately.</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={period} onValueChange={changePeriod}>
            <SelectTrigger className="w-full sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIOD_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {period === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => { setCustomFrom(e.target.value); setData(null); }} className="w-full sm:w-40" />
              <Input type="date" value={customTo} onChange={(e) => { setCustomTo(e.target.value); setData(null); }} className="w-full sm:w-40" />
            </>
          )}
          <Button variant="outline" size="icon" onClick={() => changePeriod(period)} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(totals?.revenue ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Orders</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totals?.orders ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Items sold</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totals?.itemsSold ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{formatCurrency(totals?.profit ?? 0)}</p>
                <p className="text-xs text-muted-foreground">
                  {totals?.marginPct != null ? (
                    <span className={totals.marginPct >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {totals.marginPct}% margin
                    </span>
                  ) : (
                    "Set cost prices to see margin"
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Voided sales</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{totals?.voids ?? 0}</p>
              </CardContent>
            </Card>
          </div>

          {split.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment split</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {split.map((s) => (
                  <Badge key={s.method} variant="secondary" className="px-3 py-1 text-sm capitalize">
                    {s.method}: {formatCurrency(s.amount)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Daily revenue (last 14 days)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {daily.every((d) => d.revenue === 0) ? (
                <p className="py-4 text-center text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                daily.map((d) => (
                  <div key={d.date} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 text-muted-foreground sm:w-16">{d.label}</span>
                    <div className="h-2.5 min-w-0 flex-1 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, (d.revenue / maxDaily) * 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right font-medium sm:w-24">{formatCurrency(d.revenue)}</span>
                    <span className="hidden w-14 shrink-0 text-right text-xs text-muted-foreground sm:block">
                      {d.orders} ord.
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Best sellers</CardTitle>
            </CardHeader>
            <CardContent>
              {sellers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No sales in this period.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Size / Color</TableHead>
                      <TableHead className="text-right">Units</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sellers.map((s, i) => (
                      <TableRow key={s.variantId}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">{s.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{s.sizeColor || "—"}</TableCell>
                        <TableCell className="text-right">{s.units}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.revenue)}</TableCell>
                        <TableCell className="text-right">{s.profit != null ? formatCurrency(s.profit) : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <TrendingDown className="size-4 text-amber-600" /> Slow movers
              </CardTitle>
            </CardHeader>
            <CardContent>
              {movers.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Every in-stock variant has sold in this period.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Size / Color</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">Sold in period</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movers.map((m) => (
                      <TableRow key={m.variantId}>
                        <TableCell className="font-medium">{m.productName}</TableCell>
                        <TableCell className="text-muted-foreground">{m.sizeColor || "—"}</TableCell>
                        <TableCell className="text-right">{m.stockQty}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="secondary">{m.unitsSold} units</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
