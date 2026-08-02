"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} registered customer{customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
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
        className="max-w-xs"
      />

      <div className="rounded-lg border bg-card">
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
