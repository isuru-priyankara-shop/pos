"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil, Plus, Power, Tags } from "lucide-react";
import { toast } from "sonner";

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
import { cn } from "@/lib/utils";

const PRODUCT_STATUS_BADGE = {
  in_stock: "bg-primary/10 text-primary",
  low: "bg-warning/10 text-warning",
  out: "bg-destructive/10 text-destructive",
  disabled: "bg-muted text-muted-foreground",
} as const;

const STATUS_RANK: Record<string, number> = {
  out: 0,
  low: 1,
  in_stock: 2,
  disabled: 3,
  no_variants: 4,
};

type SortKey = "name" | "category" | "variants" | "stock" | "price" | "status";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

function SortHead({
  label,
  sortKey,
  sort,
  onToggle,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onToggle: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {label}
        <Icon className="size-3.5" />
      </button>
    </TableHead>
  );
}

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
  const [sort, setSort] = useState<SortState>({ key: "name", dir: "asc" });

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
    const list = products.filter((p) => {
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

    const sorted = [...list];
    sorted.sort((a, b) => {
      const aActive = a.variants.filter((v) => v.is_active);
      const bActive = b.variants.filter((v) => v.is_active);
      let cmp = 0;
      switch (sort.key) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "category":
          cmp = (a.category?.name ?? "").localeCompare(b.category?.name ?? "");
          break;
        case "variants":
          cmp = aActive.length - bActive.length;
          break;
        case "stock": {
          const aStock = aActive.reduce((acc, v) => acc + v.stock_qty, 0);
          const bStock = bActive.reduce((acc, v) => acc + v.stock_qty, 0);
          cmp = aStock - bStock;
          break;
        }
        case "price": {
          const aPrice = aActive.length ? Math.min(...aActive.map((v) => v.price)) : -1;
          const bPrice = bActive.length ? Math.min(...bActive.map((v) => v.price)) : -1;
          cmp = aPrice - bPrice;
          break;
        }
        case "status":
          cmp = STATUS_RANK[productStatus(a).label] - STATUS_RANK[productStatus(b).label];
          break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [products, search, categoryFilter, statusFilter, sort]);

  function productStatus(p: ProductRow): { label: string; badge: string } {
    if (!p.is_active) return { label: "disabled", badge: PRODUCT_STATUS_BADGE.disabled };
    const active = p.variants.filter((v) => v.is_active);
    if (active.length === 0) return { label: "no_variants", badge: PRODUCT_STATUS_BADGE.disabled };
    const total = active.reduce((acc, v) => acc + v.stock_qty, 0);
    const lowestReorder = Math.min(...active.map((v) => v.reorder_level));
    if (total <= 0) return { label: "out", badge: PRODUCT_STATUS_BADGE.out };
    if (total <= lowestReorder) return { label: "low", badge: PRODUCT_STATUS_BADGE.low };
    return { label: "in_stock", badge: PRODUCT_STATUS_BADGE.in_stock };
  }

  const STATUS_LABEL: Record<string, string> = {
    in_stock: "In stock",
    low: "Low stock",
    out: "Out of stock",
    disabled: "Disabled",
    no_variants: "No variants",
  };

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" },
    );
  }

  async function toggleActive(p: ProductRow) {
    const next = !p.is_active;
    const { error } = await supabase
      .from("products")
      .update({ is_active: next })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next ? `${p.name} enabled` : `${p.name} disabled`);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            {stats.low > 0 || stats.out > 0 ? (
              <span>
                <span className="font-medium text-warning">{stats.low} low</span>
                {" · "}
                <span className="font-medium text-destructive">{stats.out} out of stock</span>
              </span>
            ) : (
              "All stock levels healthy"
            )}
          </p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => setCategoriesOpen(true)}>
            <Tags className="size-4" /> Categories
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={() => { setEditingProduct(null); setEditorOpen(true); }}>
            <Plus className="size-4" /> Add product
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search name, SKU or barcode…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-full sm:w-44">
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
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stock levels</SelectItem>
            <SelectItem value="low">Low stock</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No products match.</p>
        ) : (
          filtered.map((p) => {
            const active = p.variants.filter((v) => v.is_active);
            const totalStock = active.reduce((acc, v) => acc + v.stock_qty, 0);
            const minPrice = active.length ? Math.min(...active.map((v) => v.price)) : 0;
            const status = productStatus(p);
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border bg-card p-3",
                  status.label === "out" && "border-destructive/40 bg-destructive/5",
                  status.label === "low" && "border-warning/40 bg-warning/5",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md bg-muted">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.sku_prefix ?? ""}</p>
                    </div>
                  </div>
                  <Badge className={status.badge}>{STATUS_LABEL[status.label]}</Badge>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Category</dt>
                    <dd className="truncate font-medium">{p.category?.name ?? "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Variants</dt>
                    <dd className="font-medium">{active.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Stock</dt>
                    <dd
                      className={cn(
                        "font-medium",
                        status.label === "out" && "text-destructive",
                        status.label === "low" && "text-warning",
                      )}
                    >
                      {totalStock}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Price from</dt>
                    <dd className="font-medium">{active.length ? formatCurrency(minPrice) : "—"}</dd>
                  </div>
                </dl>
                <div className="mt-2 flex justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditingProduct(p); setEditorOpen(true); }}
                  >
                    <Pencil className="size-4" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title={p.is_active ? "Disable product" : "Enable product"}
                    aria-label={p.is_active ? `Disable ${p.name}` : `Enable ${p.name}`}
                    onClick={() => toggleActive(p)}
                  >
                    <Power className={cn("size-4", !p.is_active && "text-muted-foreground")} />
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-lg border bg-card shadow-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortHead label="Product" sortKey="name" sort={sort} onToggle={toggleSort} />
              <SortHead label="Category" sortKey="category" sort={sort} onToggle={toggleSort} />
              <SortHead label="Variants" sortKey="variants" sort={sort} onToggle={toggleSort} />
              <SortHead label="Total stock" sortKey="stock" sort={sort} onToggle={toggleSort} />
              <SortHead label="Price from" sortKey="price" sort={sort} onToggle={toggleSort} />
              <SortHead label="Status" sortKey="status" sort={sort} onToggle={toggleSort} />
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
                  <TableRow
                    key={p.id}
                    className={cn(
                      status.label === "out" && "bg-destructive/5",
                      status.label === "low" && "bg-warning/5",
                    )}
                  >
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
                    <TableCell
                      className={cn(
                        "font-medium",
                        status.label === "out" && "text-destructive",
                        status.label === "low" && "text-warning",
                      )}
                    >
                      {totalStock}
                    </TableCell>
                    <TableCell>{active.length ? formatCurrency(minPrice) : "—"}</TableCell>
                    <TableCell>
                      <Badge className={status.badge}>{STATUS_LABEL[status.label]}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit product"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => { setEditingProduct(p); setEditorOpen(true); }}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title={p.is_active ? "Disable product" : "Enable product"}
                          aria-label={p.is_active ? `Disable ${p.name}` : `Enable ${p.name}`}
                          onClick={() => toggleActive(p)}
                        >
                          <Power className={cn("size-4", !p.is_active && "text-muted-foreground")} />
                        </Button>
                      </div>
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
