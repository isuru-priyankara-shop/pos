"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { canManageCatalog, canAccessReporting, canManageProfiles } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const NAV_ITEMS = [
  { href: "/pos", label: "Register", show: () => true },
  { href: "/sales", label: "Sales", show: () => true },
  { href: "/customers", label: "Customers", show: () => true },
  { href: "/inventory", label: "Inventory", show: canManageCatalog },
  { href: "/purchase-orders", label: "Purchasing", show: canManageCatalog },
  { href: "/reports", label: "Reports", show: canAccessReporting },
  { href: "/staff", label: "Staff", show: canManageProfiles },
];

export function AppNav({ profile }: { profile: unknown }) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useAuth();
  const p = profile as {
    full_name: string;
    role: string;
  };

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.replace("/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((item) => item.show());

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 items-center gap-4 px-4">
        <Link href="/pos" className="font-bold tracking-tight">
          Store POS
        </Link>
        <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium"
                    : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="capitalize">
            {p.role}
          </Badge>
          <span className="hidden text-sm text-muted-foreground sm:inline">{p.full_name}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
