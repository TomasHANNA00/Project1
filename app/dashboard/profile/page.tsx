"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [companyName, setCompanyName] = useState(profile?.company_name ?? "");
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);

    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim() || null, company_name: companyName.trim() || null })
      .eq("id", user.id);

    setSaving(false);
    if (err) {
      setError("Error al guardar. Intenta de nuevo.");
    } else {
      await refreshProfile();
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    }
  };

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-zinc-900">Mi Perfil</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Actualiza tu información de contacto y empresa.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Correo electrónico
            </label>
            <input
              type="email"
              value={user?.email ?? ""}
              disabled
              className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-400"
            />
          </div>
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-zinc-700">
              Nombre completo
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label htmlFor="companyName" className="mb-1 block text-sm font-medium text-zinc-700">
              Empresa
            </label>
            <input
              id="companyName"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Nombre de tu empresa"
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
            {savedOk && (
              <span className="text-sm text-green-600">✓ Guardado correctamente</span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
