"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import type { Customer } from "@/lib/db.types";
import { validateCustomerForm, type CustomerForm } from "@/lib/customers";
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
import { Label } from "@/components/ui/label";

export function CustomerFormDialog({
  open,
  customer,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="sm:max-w-md">
          <CustomerForm
            key={customer?.id ?? "new"}
            customer={customer}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function CustomerForm({
  customer,
  onOpenChange,
  onSaved,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const { supabase } = useAuth();
  const [form, setForm] = useState<CustomerForm>({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const errs = validateCustomerForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors({ ...errs });
      return;
    }
    setSaving(true);
    try {
      if (customer) {
        const { error } = await supabase
          .from("customers")
          .update({
            name: form.name.trim(),
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
          })
          .eq("id", customer.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert({
          id: crypto.randomUUID(),
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        });
        if (error) throw error;
      }
      await onSaved();
      toast.success(customer ? "Customer updated" : "Customer added");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{customer ? "Edit customer" : "Add customer"}</DialogTitle>
        <DialogDescription>Name is required; phone and email are optional.</DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="c-name">Name *</Label>
          <Input
            id="c-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Nimal Perera"
          />
          {errors.name ? <p className="text-xs text-red-500">{errors.name}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-phone">Phone</Label>
          <Input
            id="c-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="0771234567"
          />
          {errors.phone ? <p className="text-xs text-red-500">{errors.phone}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-email">Email</Label>
          <Input
            id="c-email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="nimal@example.com"
          />
          {errors.email ? <p className="text-xs text-red-500">{errors.email}</p> : null}
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save customer"}
        </Button>
      </DialogFooter>
    </>
  );
}
