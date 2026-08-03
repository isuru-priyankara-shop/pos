"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Boxes,
  LogOut,
  Menu,
  ReceiptText,
  ScanBarcode,
  Settings as SettingsIcon,
  Store,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { useAuth } from "@/components/auth-provider";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  canAccessReporting,
  canManageCatalog,
  canManageProfiles,
} from "@/lib/auth";
import type { Profile } from "@/lib/db.types";
import { cn } from "@/lib/utils";

type Icon = typeof Store;

interface NavItem {
  href: string;
  label: string;
  icon: Icon;
  show: (p: Profile | null) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/pos", label: "Register", icon: Store, show: () => true },
  { href: "/sales", label: "Sales", icon: ReceiptText, show: () => true },
  { href: "/customers", label: "Customers", icon: Users, show: () => true },
  { href: "/inventory", label: "Inventory", icon: Boxes, show: canManageCatalog },
  {
    href: "/purchase-orders",
    label: "Purchasing",
    icon: Truck,
    show: canManageCatalog,
  },
  { href: "/reports", label: "Analytics", icon: BarChart3, show: canAccessReporting },
  { href: "/barcodes", label: "Barcodes", icon: ScanBarcode, show: canManageProfiles },
  { href: "/staff", label: "Staff", icon: UserCog, show: canManageProfiles },
  { href: "/settings", label: "Settings", icon: SettingsIcon, show: canManageProfiles },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AppShell({
  profile,
  children,
}: {
  profile: unknown;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase } = useAuth();
  const p = profile as Profile | null;

  const items = NAV_ITEMS.filter((item) => item.show(p));
  const active = items.find((item) => isActive(pathname, item.href));

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.replace("/login");
    router.refresh();
  }

  const sidebar = (
    <>
      <Link
        href="/pos"
        className="flex h-14 shrink-0 items-center justify-center border-b text-primary"
        aria-label="Store POS home"
        title="Store POS"
      >
        <Store className="size-5" />
      </Link>
      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto py-3">
        {items.map((item) => {
          const Icon = item.icon;
          const isCurrent = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isCurrent ? "page" : undefined}
              title={item.label}
              aria-label={item.label}
              className={cn(
                "flex size-10 items-center justify-center rounded-lg transition-colors",
                isCurrent
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-col items-center gap-1.5 border-t py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={signOut}
          aria-label="Sign out"
          title="Sign out"
        >
          <LogOut className="size-5" />
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop icon rail */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-16 flex-col border-r bg-sidebar lg:flex">
        {sidebar}
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:pl-16">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label="Menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-2 p-0">
              <SheetHeader className="border-b p-4">
                <SheetTitle className="flex items-center justify-between text-left">
                  <span>Store POS</span>
                  <Badge variant="outline" className="capitalize">
                    {p?.role ?? "staff"}
                  </Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-1 flex-col p-2">
                <nav className="flex flex-col gap-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isCurrent = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium",
                          isCurrent
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4.5" />
                        {item.label}
                      </Link>
                    );
                  })}
                </nav>
                <div className="mt-auto border-t p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start"
                    onClick={signOut}
                  >
                    <LogOut className="size-4" /> Sign out
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {active?.label ?? "Dashboard"}
            </h1>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <ThemeToggle />
            <span className="hidden sm:inline-flex">
              <Badge variant="outline" className="capitalize">
                {p?.role ?? "staff"}
              </Badge>
            </span>
            <div
              className="hidden h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary sm:flex"
              title={p?.full_name ?? ""}
            >
              {initials(p?.full_name ?? "") || "?"}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}