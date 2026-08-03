"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, LogOut } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { canManageCatalog, canAccessReporting, canManageProfiles } from "@/lib/auth";
import type { Profile } from "@/lib/db.types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";

const NAV_ITEMS = [
  { href: "/pos", label: "Register", show: () => true },
  { href: "/sales", label: "Sales", show: () => true },
  { href: "/customers", label: "Customers", show: () => true },
  { href: "/inventory", label: "Inventory", show: canManageCatalog },
  { href: "/purchase-orders", label: "Purchasing", show: canManageCatalog },
  { href: "/reports", label: "Reports", show: canAccessReporting },
  { href: "/staff", label: "Staff", show: canManageProfiles },
  { href: "/settings", label: "Settings", show: canManageProfiles },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function AppNav({ profile }: { profile: unknown }) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useAuth();
  const p = profile as Profile | null;

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.replace("/login");
    router.refresh();
  }

  const items = NAV_ITEMS.filter((item) => item.show(p));

  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-14 items-center gap-4 px-4">
        {/* Mobile menu */}
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-2 p-0">
            <SheetHeader className="border-b p-4">
              <SheetTitle className="flex items-center justify-between">
                <span>Store POS</span>
                <Badge variant="outline" className="capitalize">
                  {p?.role ?? "staff"}
                </Badge>
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-1 flex-col gap-1 p-2">
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    isActive(pathname, item.href)
                      ? "rounded-md bg-accent px-3 py-2.5 text-sm font-medium"
                      : "rounded-md px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent/50"
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t p-2">
              <div className="flex items-center justify-between px-3 py-1.5">
                <span className="text-sm text-muted-foreground">{p?.full_name ?? ""}</span>
                <Button variant="ghost" size="sm" onClick={signOut}>
                  <LogOut className="size-4" /> Sign out
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>

        <Link href="/pos" className="font-bold tracking-tight">
          Store POS
        </Link>

        {/* Desktop nav */}
        <nav className="hidden flex-1 items-center gap-1 overflow-x-auto md:flex">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive(pathname, item.href)
                  ? "rounded-md bg-accent px-3 py-1.5 text-sm font-medium"
                  : "rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/50"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <Badge variant="outline" className="hidden capitalize sm:inline-flex">
            {p?.role ?? "staff"}
          </Badge>
          <span className="hidden text-sm text-muted-foreground sm:inline">{p?.full_name ?? ""}</span>
          <Button variant="ghost" size="sm" onClick={signOut} className="hidden sm:inline-flex">
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
