"use client";

import { useMemo, useState } from "react";
import { Plus, Tags } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import type { Category } from "@/lib/db.types";
import { variantStatus, type ProductRow } from "@/lib/inventory";
import { formatCurrency } from "@/lib/money";
import { ProductFormDialog } from "@/components/inventory/product-form-dialog";
import { CategoryManager } from "@/components/inventory/category-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

const PRODUCT_STATUS_BADGE = {
  in_stock: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  low: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  out: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  disabled: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
} as const;

export function InventoryManager({
  initialProducts,
  initialCategories,
}: {
  initialProducts: ProductRow[];
  initialCategories: Category[];
}) {
  const { supabase } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>(initialProducts);
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "low" | "out">("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);

  async function refresh() {
    const [{ data: prods }, { data: cats }] = await Promise.all([
      supabase
        .from("products")
        .select("*, category:categories(*), variants:product_variants(*)")
        .order("name"),
      supabase.from("categories").select("*").order("name"),
    ]);
    if (prods) setProducts(prods as unknown as ProductRow[]);
    if (cats) setCategories(cats as Category[]);
  }

  const stats = useMemo(() => {
    const variants = products.flatMap((p) => p.variants);
    return {
      low: variants.filter((v) => variantStatus(v) === "low").length,
      out: variants.filter((v) => variantStatus(v) === "out").length,
    };
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "all" && p.category_id !== categoryFilter) return false;
      if (statusFilter !== "all") {
        const worst = p.variants.reduce<"in_stock" | "low" | "out">((acc, v) => {
          const s = variantStatus(v);
          if (s === "out" || acc === "out") return "out";
          if (s === "low" || acc === "low") return "low";
          return acc;
        }, "in_stock");
        if (statusFilter === "low" && worst !== "low") return false;
        if (statusFilter === "out" && worst !== "out") return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku_prefix ?? "").toLowerCase().includes(q) ||
        p.variants.some((v) => v.barcode.toLowerCase().includes(q))
      );
    });
  }, [products, search, categoryFilter, statusFilter]);

  function productStatus(p: ProductRow): { label: string; badge: string } {
    if (!p.is_active) return { label: "Disabled", badge: PRODUCT_STATUS_BADGE.disabled };
    const active = p.variants.filter((v) => v.is_active);
    if (active.length === 0) return { label: "No variants", badge: PRODUCT_STATUS_BADGE.disabled };
    const total = active.reduce((acc, v) => acc + v.stock_qty, 0);
    const lowestReorder = Math.min(...active.map((v) => v.reorder_level));
    if (total <= 0) return { label: "Out of stock", badge: PRODUCT_STATUS_BADGE.out };
    if (total <= lowestReorder) return { label: "Low stock", badge: PRODUCT_STATUS_BADGE.low };
    return { label: "In stock", badge: PRODUCT_STATUS_BADGE.in_stock };
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {stats.low > 0 || stats.out > 0 ? (
              <span>
                <span className="font-medium text-amber-600">{stats.low} low</span>
                {" · "}
                <span className="font-medium text-red-600">{stats.out} out of stock</span>
              </span>
            ) : (
              "All stock levels healthy"
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Tags className="size-4" /> Categories
          </Button>
          <Button onClick={() => { setEditingProduct(null); setEditorOpen(true); }}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, SKU or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "low" | "out")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock levels</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Variants</TableHead>
              <TableHead>Total stock</TableHead>
              <TableHead>Price from</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No products match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => {
                const active = p.variants.filter((v) => v.is_active);
                const totalStock = active.reduce((acc, v) => acc + v.stock_qty, 0);
                const minPrice = active.length ? Math.min(...active.map((v) => v.price)) : 0;
                const status = productStatus(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                          {p.image_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.sku_prefix ?? ""}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{p.category?.name ?? "—"}</TableCell>
                    <TableCell>{active.length}</TableCell>
                    <TableCell>{totalStock}</TableCell>
                    <TableCell>{active.length ? formatCurrency(minPrice) : "—"}</TableCell>
                    <TableCell>
                      <Badge className={status.badge}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditingProduct(p); setEditorOpen(true); }}
                      >
                        Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ProductFormDialog
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditingProduct(null);
        }}
        product={editingProduct}
        categories={categories}
        onSaved={refresh}
      />

      <CategoryManager
        open={categoriesOpen}
        onOpenChange={setCategoriesOpen}
        initialCategories={categories}
        products={products}
        onChanged={refresh}
      />
    </div>
  );
}
