"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import type { InventoryTransaction, ProductVariant } from "@/lib/db.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

const TX_BADGE: Record<InventoryTransaction["type"], string> = {
  restock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  sale: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  adjustment: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  return: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
};

function txLabel(t: InventoryTransaction["type"]) {
  switch (t) {
    case "restock":
      return "Restock";
    case "sale":
      return "Sale";
    case "adjustment":
      return "Adjustment";
    case "return":
      return "Return";
  }
}

export function TransactionsDialog({
  variant,
  onOpenChange,
}: {
  variant: ProductVariant | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!variant;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && variant && (
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <TxHistory key={variant.id} variant={variant} onOpenChange={onOpenChange} />
        </DialogContent>
      )}
    </Dialog>
  );
}

function TxHistory({
  variant,
  onOpenChange,
}: {
  variant: ProductVariant;
  onOpenChange: (open: boolean) => void;
}) {
  const { supabase } = useAuth();
  const [rows, setRows] = useState<InventoryTransaction[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("inventory_transactions")
      .select("*")
      .eq("variant_id", variant.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        if (!cancelled) setRows((data as InventoryTransaction[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [variant.id, supabase]);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Stock history</DialogTitle>
        <DialogDescription>
          {`${[variant.size, variant.color].filter(Boolean).join(" · ") || "Variant"} · ${variant.barcode}`}
        </DialogDescription>
      </DialogHeader>

      {rows === null ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No stock movements recorded yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <Badge className={TX_BADGE[r.type]}>{txLabel(r.type)}</Badge>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.type === "sale" ? "-" : "+"}
                  {r.quantity}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("en-LK")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
        Close
      </Button>
    </>
  );
}
