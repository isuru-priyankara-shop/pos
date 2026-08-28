"use client";

import { useState } from "react";
import { CalendarDays, CalendarRange, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import {
  downloadSalesReport,
  rangeForMode,
  refFromInput,
  type ReportMode,
  type ReportSaleExportRow,
} from "@/lib/report-export";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

const MODE_META: Record<ReportMode, { label: string; description: string }> = {
  day: { label: "Daily report", description: "All sales for one specific day." },
  month: { label: "Monthly report", description: "All sales in one calendar month." },
  year: { label: "Yearly report", description: "All sales in one calendar year." },
};

function defaultInputValue(mode: ReportMode): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  if (mode === "day") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (mode === "month") return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return String(now.getFullYear());
}

export function ReportDownload({ initialSales }: { initialSales: ReportSaleExportRow[] }) {
  const { supabase } = useAuth();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReportMode>("day");
  const [value, setValue] = useState(defaultInputValue("day"));
  const [busy, setBusy] = useState(false);

  function choose(m: ReportMode) {
    setMode(m);
    setValue(defaultInputValue(m));
    setOpen(true);
  }

  async function fetchRange(fromISO: string, toISO: string): Promise<ReportSaleExportRow[]> {
    // PostgREST caps page size, so walk pages until exhausted.
    const all: unknown[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from("sales")
        .select(
          "*, items:sale_items(*, variant:product_variants(*, product:products(name))), payments(*), customer:customers(name, phone), cashier:profiles(full_name)"
        )
        .gte("sale_date", fromISO)
        .lt("sale_date", toISO)
        .order("sale_date", { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      all.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return all as unknown as ReportSaleExportRow[];
  }

  async function handleDownload() {
    const ref = refFromInput(mode, value);
    if (!ref) {
      toast.error("Pick a valid date");
      return;
    }
    const { from, to } = rangeForMode(mode, ref);
    setBusy(true);
    try {
      const sales = await fetchRange(from.toISOString(), to.toISOString());
      const name = downloadSalesReport(sales, mode, ref);
      toast.success(`Downloaded ${name}${sales.length === 0 ? " (no sales in period)" : ""}`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Report failed");
    } finally {
      setBusy(false);
    }
  }

  const years = (() => {
    const current = new Date().getFullYear();
    const earliest = initialSales.length
      ? Math.min(current, new Date(initialSales[initialSales.length - 1].sale_date).getFullYear())
      : current;
    const list: number[] = [];
    for (let y = current; y >= earliest; y--) list.push(y);
    return list;
  })();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">
            <Download className="size-4" /> Download report
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Report period</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => choose("day")}>
            <CalendarDays className="size-4" /> Daily
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => choose("month")}>
            <CalendarRange className="size-4" /> Monthly
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => choose("year")}>
            <CalendarRange className="size-4" /> Yearly
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{MODE_META[mode].label}</DialogTitle>
            <DialogDescription>{MODE_META[mode].description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {mode === "day" && (
              <>
                <Label htmlFor="report-day">Date</Label>
                <Input
                  id="report-day"
                  type="date"
                  value={value}
                  max={defaultInputValue("day")}
                  onChange={(e) => setValue(e.target.value)}
                />
              </>
            )}
            {mode === "month" && (
              <>
                <Label htmlFor="report-month">Month</Label>
                <Input
                  id="report-month"
                  type="month"
                  value={value}
                  max={defaultInputValue("month")}
                  onChange={(e) => setValue(e.target.value)}
                />
              </>
            )}
            {mode === "year" && (
              <>
                <Label htmlFor="report-year">Year</Label>
                <Select value={value} onValueChange={setValue}>
                  <SelectTrigger id="report-year" className="w-full">
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    {(years.length ? years : [new Date().getFullYear()]).map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy || !value} onClick={handleDownload}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
              Download .xlsx
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
