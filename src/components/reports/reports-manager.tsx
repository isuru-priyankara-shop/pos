"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import {
  aggregateSales,
  bestSellers,
  completedSaleIds,
  dailyBreakdown,
  growthPct,
  paymentSplit,
  periodRangeISO,
  type ReportItemRow,
  type ReportPaymentRow,
  type ReportPeriod,
  type ReportSaleRow,
  type ReportVariantRow,
} from "@/lib/reporting";
import { formatCurrency, round2 } from "@/lib/money";
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
import { cn } from "@/lib/utils";

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

const SALE_STATUS_BADGE: Record<string, string> = {
  completed: "bg-primary/10 text-primary",
  void: "bg-warning/10 text-warning",
};

function RevenueLine({
  rows,
  className,
}: {
  rows: { label: string; revenue: number }[];
  className?: string;
}) {
  const W = 640;
  const H = 200;
  const padX = 8;
  const padY = 24;
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  const step = rows.length > 1 ? (W - padX * 2) / (rows.length - 1) : 0;
  const points = rows.map((r, i) => ({
    x: padX + step * i,
    y: H - padY - (r.revenue / max) * (H - padY * 2),
  }));
  const line = points.map((p) => `${p.x},${p.y}`).join(" ");
  const area = `M${points[0]?.x ?? 0},${H - padY} L${line
    .split(" ")
    .join(" L")} L${points[points.length - 1]?.x ?? W - padX},${H - padY} Z`;
  const mid = points[Math.floor(points.length / 2)];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={cn("h-48 w-full text-primary", className)}
      role="img"
      aria-label="Revenue trend"
    >
      <defs>
        <linearGradient id="revenue-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={0}
          x2={W}
          y1={H - padY * f}
          y2={H - padY * f}
          className="stroke-border"
          strokeWidth={1}
          strokeDasharray="4 4"
        />
      ))}
      {area && <path d={area} fill="url(#revenue-fill)" />}
      {line && (
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {points.map((p) => (
        <circle key={p.x} cx={p.x} cy={p.y} r={3} fill="currentColor" />
      ))}
      <text x={padX} y={H - 6} className="fill-muted-foreground" fontSize={11}>
        {rows[0]?.label ?? ""}
      </text>
      {mid && (
        <text x={mid.x} y={H - 6} textAnchor="middle" className="fill-muted-foreground" fontSize={11}>
          {rows[Math.floor(rows.length / 2)]?.label ?? ""}
        </text>
      )}
      <text x={W - padX} y={H - 6} textAnchor="end" className="fill-muted-foreground" fontSize={11}>
        {rows[rows.length - 1]?.label ?? ""}
      </text>
    </svg>
  );
}

export function ReportsManager() {
  const { supabase } = useAuth();
  const [period, setPeriod] = useState<ReportPeriod>("7d");
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
  const completed = useMemo(
    () => (data ? completedSaleIds(data.sales) : new Set<string>()),
    [data],
  );
  const sellers = useMemo(
    () => (data ? bestSellers(data.items, completed, 5) : []),
    [data, completed],
  );
  const split = data ? paymentSplit(data.payments) : [];
  const daily = data ? dailyBreakdown(data.sales, data.items, 14) : [];
  const growth = growthPct(daily);

  const avgOrder = useMemo(
    () => (totals && totals.orders > 0 ? round2(totals.revenue / totals.orders) : 0),
    [totals],
  );

  const recent = useMemo(() => {
    if (!data) return [];
    const totalsBySale = new Map<string, number>();
    for (const it of data.items) {
      if (!completed.has(it.sale_id)) continue;
      totalsBySale.set(it.sale_id, round2((totalsBySale.get(it.sale_id) ?? 0) + it.line_total));
    }
    return [...data.sales]
      .sort((a, b) => b.sale_date.localeCompare(a.sale_date))
      .slice(0, 8)
      .map((s) => ({
        id: s.id,
        status: s.status,
        sale_date: s.sale_date,
        total: totalsBySale.get(s.id) ?? 0,
      }));
  }, [data, completed]);

  const topProducts = useMemo(
    () =>
      sellers.map((s) => ({
        name: s.productName,
        revenue: s.revenue,
        units: s.units,
      })),
    [sellers],
  );
  const maxProduct = Math.max(1, ...topProducts.map((p) => p.revenue));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Completed sales only; voids counted separately.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select value={period} onValueChange={changePeriod}>
            <SelectTrigger className="w-full sm:w-44">
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
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setData(null);
                }}
                className="w-full sm:w-40"
              />
              <Input
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setData(null);
                }}
                className="w-full sm:w-40"
              />
            </>
          )}
          <Button variant="outline" size="icon" onClick={() => changePeriod(period)} title="Refresh">
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Revenue
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatCurrency(totals?.revenue ?? 0)}
                </p>
                {growth != null && (
                  <p
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 text-xs font-medium",
                      growth >= 0 ? "text-primary" : "text-destructive",
                    )}
                  >
                    {growth >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                    {growth >= 0 ? "+" : ""}
                    {growth}% vs prior 7 days
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Transactions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">{totals?.orders ?? 0}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totals?.itemsSold ?? 0} items sold · {totals?.voids ?? 0} voided
                </p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Average order
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">{formatCurrency(avgOrder)}</p>
                <p className="mt-1 text-xs text-muted-foreground">Revenue ÷ transactions</p>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Profit
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tracking-tight">
                  {formatCurrency(totals?.profit ?? 0)}
                </p>
                {totals?.marginPct != null ? (
                  <p className="mt-1 text-xs font-medium text-primary">{totals.marginPct}% margin</p>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">Set cost prices to see margin</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Trend + top products */}
          <div className="grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sales trend</CardTitle>
              </CardHeader>
              <CardContent>
                {daily.every((d) => d.revenue === 0) ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">
                    No sales in this period.
                  </p>
                ) : (
                  <RevenueLine rows={daily} />
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Top products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {topProducts.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No sales in this period.
                  </p>
                ) : (
                  topProducts.map((p) => (
                    <div key={p.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate font-medium">{p.name}</span>
                        <span className="shrink-0 font-semibold">{formatCurrency(p.revenue)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${Math.max(3, (p.revenue / maxProduct) * 100)}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground">{p.units} units</p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent transactions + payment split */}
          <div className="grid gap-3 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Recent transactions</CardTitle>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No transactions in this period.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {recent.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {new Date(r.sale_date).toLocaleString("en-LK", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                          <p className="truncate font-mono text-xs text-muted-foreground">
                            #{r.id.slice(0, 8)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <Badge className={SALE_STATUS_BADGE[r.status] ?? "bg-muted text-muted-foreground"}>
                            {r.status}
                          </Badge>
                          <span className="w-20 text-right font-semibold">
                            {formatCurrency(r.total)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Payment split</CardTitle>
              </CardHeader>
              <CardContent>
                {split.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No payments in this period.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {split.map((s) => {
                      const pct = totals && totals.revenue > 0 ? Math.round((s.amount / totals.revenue) * 100) : 0;
                      return (
                        <div key={s.method} className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="capitalize">{s.method}</span>
                            <span className="font-semibold">{formatCurrency(s.amount)}</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary/70"
                              style={{ width: `${Math.max(3, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}