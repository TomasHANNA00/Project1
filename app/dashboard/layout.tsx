"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/app/contexts/AuthContext";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, profile, loading, signOut } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-zinc-500">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const isAdmin = profile?.role === "admin";

  const navItems = isAdmin
    ? [{ label: "Clientes", href: "/dashboard/admin", icon: "👥" }]
    : [{ label: "Mi Onboarding", href: "/dashboard/onboarding", icon: "📋" }];

  return (
    <div className="flex h-screen bg-zinc-50">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-zinc-200 bg-white">
        {/* Logo */}
        <div className="flex h-14 items-center border-b border-zinc-200 px-5">
          <span className="text-lg font-bold text-zinc-900">Vambe</span>
          {isAdmin && (
            <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              Admin
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3">
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700"
                        : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
                    }`}
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* User info */}
        <div className="border-t border-zinc-200 p-3">
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
              {user.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-zinc-900">
                {user.email}
              </p>
              <p className="text-xs text-zinc-400">
                {isAdmin ? "Administrador" : "Cliente"}
              </p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-6">
          <h2 className="text-sm font-medium text-zinc-500">
            {isAdmin ? "Panel de Administración" : "Portal de Onboarding"}
          </h2>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
