"use client";

import type { PaymentEntry } from "@/lib/pos";
import { formatCurrency } from "@/lib/money";
import { Separator } from "@/components/ui/separator";

export interface ReceiptItem {
  name: string;
  size: string | null;
  color: string | null;
  quantity: number;
  unit_price: number;
  line_discount: number;
  line_total: number;
}

export interface ReceiptData {
  storeName: string;
  storeLocation: string;
  saleId: string;
  saleDate: string;
  cashierName: string;
  customerName: string | null;
  items: ReceiptItem[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  grand_total: number;
  payments: PaymentEntry[];
  change: number;
}

export function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  return (
    <div className="mx-auto w-full max-w-sm bg-white p-6 font-mono text-sm text-black print:px-8 print:py-2">
      <div className="text-center">
        <p className="text-base font-bold">{receipt.storeName || "Clothing Store"}</p>
        {receipt.storeLocation && <p className="text-xs">{receipt.storeLocation}</p>}
      </div>

      <Separator className="my-3 bg-black" />

      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between">
          <span>Receipt</span>
          <span>{receipt.saleId.slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex justify-between">
          <span>Date</span>
          <span>{new Date(receipt.saleDate).toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Cashier</span>
          <span>{receipt.cashierName}</span>
        </div>
        {receipt.customerName && (
          <div className="flex justify-between">
            <span>Customer</span>
            <span>{receipt.customerName}</span>
          </div>
        )}
      </div>

      <Separator className="my-3 bg-black" />

      <div className="space-y-1.5 text-xs">
        {receipt.items.map((item, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex justify-between gap-2">
              <span className="leading-tight">
                {item.name}
                {item.size || item.color ? ` (${[item.size, item.color].filter(Boolean).join(" · ")})` : ""}
                <span className="text-neutral-500"> x{item.quantity}</span>
              </span>
              <span>{formatCurrency(item.line_total)}</span>
            </div>
            {item.line_discount > 0 && (
              <p className="text-right text-[10px] text-neutral-500">
                discount -{formatCurrency(item.line_discount)}
              </p>
            )}
          </div>
        ))}
      </div>

      <Separator className="my-3 bg-black" />

      <div className="space-y-0.5 text-xs">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatCurrency(receipt.subtotal)}</span>
        </div>
        {receipt.discount_total > 0 && (
          <div className="flex justify-between">
            <span>Discount</span>
            <span>-{formatCurrency(receipt.discount_total)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatCurrency(receipt.tax_total)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span>Total</span>
          <span>{formatCurrency(receipt.grand_total)}</span>
        </div>
      </div>

      <Separator className="my-3 bg-black" />

      <div className="space-y-0.5 text-xs">
        {receipt.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <span className="uppercase">{p.method}</span>
            <span>{formatCurrency(p.amount)}</span>
          </div>
        ))}
        {receipt.change > 0 && (
          <div className="flex justify-between">
            <span>Change</span>
            <span>{formatCurrency(receipt.change)}</span>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-xs">Thank you for shopping with us!</p>
      <p className="text-left text-[10px] text-neutral-500">Kadex POS system : +94 76 436 0358</p>
    </div>
  );
}
