"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { Customer } from "@/lib/db.types";
import { searchCustomers, sortCustomersByName } from "@/lib/customers";
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function CustomerManager({
  initialCustomers,
  currentRole,
}: {
  initialCustomers: Customer[];
  currentRole: string;
}) {
  const { supabase } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [search, setSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);

  const canDelete = currentRole === "admin" || currentRole === "manager";

  async function refresh() {
    const { data } = await supabase.from("customers").select("*").order("name");
    if (data) setCustomers(sortCustomersByName(data as Customer[]));
  }

  async function handleDelete() {
    if (!deleting) return;
    const { error } = await supabase.from("customers").delete().eq("id", deleting.id);
    if (error) {
      toast.error(error.message.includes("foreign key") ? "Customer has sales — deactivate instead" : error.message);
      return;
    }
    setCustomers((prev) => prev.filter((c) => c.id !== deleting.id));
    toast.success("Customer deleted");
    setDeleting(null);
  }

  const filtered = searchCustomers(customers, search);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} registered customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          className="w-full sm:w-auto"
          onClick={() => {
            setEditingCustomer(null);
            setEditorOpen(true);
          }}
        >
          <Plus className="size-4" /> Add customer
        </Button>
      </div>

      <Input
        placeholder="Search name, phone or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full sm:max-w-xs"
      />

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">No customers match.</p>
        ) : (
          filtered.map((c) => (
            <div key={c.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[c.phone, c.email].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Edit customer"
                    onClick={() => {
                      setEditingCustomer(c);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete customer"
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{c.loyalty_points} pts</Badge>
                {c.credit_balance > 0 && (
                  <Badge variant="outline">Rs {c.credit_balance.toLocaleString("en-LK")}</Badge>
                )}
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
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Loyalty points</TableHead>
              <TableHead>Credit balance</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No customers match.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{c.phone ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{c.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{c.loyalty_points}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.credit_balance > 0 ? `Rs ${c.credit_balance.toLocaleString("en-LK")}` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingCustomer(c);
                          setEditorOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      {canDelete && (
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(c)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CustomerFormDialog
        open={editorOpen}
        customer={editingCustomer}
        onOpenChange={(o) => {
          setEditorOpen(o);
          if (!o) setEditingCustomer(null);
        }}
        onSaved={refresh}
      />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} will be permanently removed. Customers linked to sales cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
