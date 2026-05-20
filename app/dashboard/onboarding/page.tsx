"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";

export default function OnboardingPage() {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && profile?.role === "admin") router.replace("/dashboard/admin");
    if (!loading && profile?.project_id) router.replace("/dashboard/portal");
  }, [user, profile, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm" style={{ maxWidth: 440 }}>
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "#FEF3C7" }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-zinc-900">
          Tu cuenta aún no tiene un proyecto asignado
        </h2>
        <p className="mb-6 text-sm text-zinc-500">
          Contacta a tu administrador en Vambe para que te asigne un proyecto.
          Una vez asignado, podrás ver tu Portal de Status aquí.
        </p>
        <button
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          className="rounded-lg bg-zinc-100 px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200"
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}
