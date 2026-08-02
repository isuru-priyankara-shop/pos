"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { Category } from "@/lib/db.types";
import type { ProductRow } from "@/lib/inventory";
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

export function CategoryManager({
  open,
  onOpenChange,
  initialCategories,
  products,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCategories: Category[];
  products: ProductRow[];
  onChanged: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const productCount = (id: string) => products.filter((p) => p.category_id === id).length;

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    const { data, error } = await supabase.from("categories").insert({ name }).select().single();
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Category already exists" : error.message);
      return;
    }
    setCategories((prev) => [...prev, data as Category]);
    setNewName("");
    await onChanged();
    toast.success("Category added");
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name) {
      setEditing(null);
      return;
    }
    const { error } = await supabase.from("categories").update({ name }).eq("id", id);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Category already exists" : error.message);
      return;
    }
    setCategories((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
    setEditing(null);
    await onChanged();
    toast.success("Category renamed");
  }

  async function handleDelete(id: string) {
    const count = productCount(id);
    if (count > 0) {
      toast.error(`Cannot delete — ${count} product${count === 1 ? "" : "s"} use this category`);
      return;
    }
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    await onChanged();
    toast.success("Category deleted");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>Categories group products for faster POS browsing.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              No categories yet.
            </p>
          ) : (
            categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border px-3 py-2">
                {editing === c.id ? (
                  <>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleRename(c.id)}
                      autoFocus
                    />
                    <Button size="sm" onClick={() => handleRename(c.id)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {productCount(c.id)} product{productCount(c.id) === 1 ? "" : "s"}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditing(c.id);
                        setEditName(c.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Input
            placeholder="New category name…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={!newName.trim()}>
            <Plus className="size-4" /> Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
