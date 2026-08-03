"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Profile, Role } from "@/lib/db.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  cashier: "Cashier",
};

const ROLE_STYLE: Record<Role, string> = {
  admin: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  manager: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  cashier: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

interface StaffForm {
  full_name: string;
  email: string;
  password: string;
  confirm: string;
  role: Role;
  is_active: boolean;
}

const EMPTY_FORM: StaffForm = {
  full_name: "",
  email: "",
  password: "",
  confirm: "",
  role: "cashier",
  is_active: true,
};

export function StaffManagement({
  initialStaff,
  currentUserId,
}: {
  initialStaff: Profile[];
  currentUserId: string;
}) {
  const [staff, setStaff] = useState<Profile[]>(initialStaff);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [form, setForm] = useState<StaffForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof StaffForm>(key: K, value: StaffForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  }

  function openEdit(p: Profile) {
    setEditing(p);
    setForm({
      full_name: p.full_name,
      email: p.email ?? "",
      password: "",
      confirm: "",
      role: p.role,
      is_active: p.is_active,
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (form.password !== form.confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          role: form.role,
          is_active: form.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create user");
      toast.success(`Staff account created for ${form.email}`);
      setAddOpen(false);
      setForm(EMPTY_FORM);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    if (editing.id === currentUserId && (!form.is_active || form.role !== "admin")) {
      toast.error("You cannot demote or deactivate your own account");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: form.full_name,
          role: form.role,
          is_active: form.is_active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update user");
      toast.success("Staff account updated");
      setEditing(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    const res = await fetch("/api/admin/users", { method: "GET" });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data.staff)) setStaff(data.staff);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Staff</h1>
          <p className="text-sm text-muted-foreground">
            Create login accounts and manage roles. New users get a password set by you and can
            sign in immediately.
          </p>
        </div>
        <Button onClick={openAdd} className="w-full sm:w-auto">
          <Plus className="size-4" /> Add staff
        </Button>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  No staff yet. Click &quot;Add staff&quot; to create the first account.
                </TableCell>
              </TableRow>
            ) : (
              staff.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {p.full_name}
                    {p.id === currentUserId && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        you
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>{p.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge className={ROLE_STYLE[p.role]}>{ROLE_LABEL[p.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    {p.is_active ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add staff member</DialogTitle>
            <DialogDescription>
              Creates a login account. The person can sign in at /login immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Full name</Label>
              <Input
                id="add-name"
                value={form.full_name}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="Jane Doe"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="jane@yourstore.com"
                required
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="add-password">Password</Label>
                <Input
                  id="add-password"
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="min 8 characters"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="add-confirm">Confirm</Label>
                <Input
                  id="add-confirm"
                  type="password"
                  value={form.confirm}
                  onChange={(e) => set("confirm", e.target.value)}
                  placeholder="repeat password"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => set("role", v as Role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Label htmlFor="add-active" className="flex items-center gap-2">
                  <Switch
                    id="add-active"
                    checked={form.is_active}
                    onCheckedChange={(v) => set("is_active", v)}
                  />
                  Active
                </Label>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Creating…" : "Create account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit staff member</DialogTitle>
            <DialogDescription>Update role or active status.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="space-y-2">
                <Label>Full name</Label>
                <Input
                  value={form.full_name}
                  onChange={(e) => set("full_name", e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={form.email} disabled />
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed here. Role and status below:
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Role</Label>
                  <Select
                    value={form.role}
                    onValueChange={(v) => set("role", v as Role)}
                    disabled={editing.id === currentUserId}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cashier">Cashier</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2 pb-1">
                  <Label className="flex items-center gap-2">
                    <Switch
                      checked={form.is_active}
                      onCheckedChange={(v) => set("is_active", v)}
                      disabled={editing.id === currentUserId}
                    />
                    Active
                  </Label>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "Saving…" : "Save changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
