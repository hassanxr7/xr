"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useOwner } from "@/lib/owner-context";
import { LiveEventsProvider } from "@/lib/live-events-context";
import { ConnectionBadge } from "@/components/ConnectionBadge";
import { BRAND_NAME } from "@/lib/branding";
import { api } from "@/lib/api";

const NAV = [
  { href: "/overview", label: "Overview" },
  { href: "/inbox", label: "Inbox" },
  { href: "/devices", label: "Devices" },
  { href: "/settings", label: "Settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { owner, loading, setOwner } = useOwner();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !owner) router.replace("/login");
  }, [loading, owner, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: "var(--color-text-muted)" }}>
        Loading…
      </div>
    );
  }
  if (!owner) return null;

  async function handleLogout() {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // best-effort; clear client state regardless
    }
    setOwner(null as never);
    router.replace("/login");
  }

  return (
    <LiveEventsProvider>
      <div className="min-h-screen flex flex-col md:flex-row">
        <aside
          className="w-full md:w-56 md:shrink-0 border-b md:border-b-0 md:border-r flex md:flex-col"
          style={{ borderColor: "var(--color-border)", background: "var(--color-surface)" }}
        >
          <div className="px-4 py-4 font-semibold text-sm hidden md:block">{BRAND_NAME}</div>
          <nav className="flex md:flex-col gap-1 px-2 py-2 md:py-0 overflow-x-auto">
            {NAV.map((item) => {
              const active = pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 rounded-md text-sm whitespace-nowrap"
                  style={{
                    background: active ? "var(--color-accent)" : "transparent",
                    color: active ? "var(--color-accent-contrast)" : "var(--color-text)",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="hidden md:block mt-auto px-4 py-4 space-y-2">
            <ConnectionBadge />
            <div className="text-xs truncate" style={{ color: "var(--color-text-muted)" }}>
              {owner.email}
            </div>
            <button
              onClick={handleLogout}
              className="text-xs underline"
              style={{ color: "var(--color-text-muted)" }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">
          <div className="md:hidden flex items-center justify-between mb-4">
            <ConnectionBadge />
            <button onClick={handleLogout} className="text-xs underline" style={{ color: "var(--color-text-muted)" }}>
              Sign out
            </button>
          </div>
          {children}
        </main>
      </div>
    </LiveEventsProvider>
  );
}
