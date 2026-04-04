"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { Profile } from "@/lib/types";

interface ClientRow extends Profile {
  submission_count: number;
  last_activity: string | null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Sin actividad";
  return new Date(dateStr).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

interface InviteForm {
  email: string;
  full_name: string;
  company_name: string;
}

export default function AdminClientsPage() {
  const { user, session, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteForm>({ email: "", full_name: "", company_name: "" });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const loadClients = async () => {
    setLoading(true);
    try {
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "client")
        .order("created_at", { ascending: false });
      if (profilesErr) throw profilesErr;

      const { data: subsData } = await supabase
        .from("submissions")
        .select("client_id, updated_at, text_content");

      const subsByClient: Record<string, { count: number; lastActivity: string }> = {};
      for (const sub of subsData ?? []) {
        if (!subsByClient[sub.client_id]) {
          subsByClient[sub.client_id] = { count: 0, lastActivity: sub.updated_at };
        }
        subsByClient[sub.client_id].count += 1;
        if (sub.updated_at > subsByClient[sub.client_id].lastActivity) {
          subsByClient[sub.client_id].lastActivity = sub.updated_at;
        }
      }

      setClients(
        (profilesData ?? []).map((p) => ({
          ...p,
          submission_count: subsByClient[p.id]?.count ?? 0,
          last_activity: subsByClient[p.id]?.lastActivity ?? null,
        }))
      );
    } catch {
      setError("Error al cargar los clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") loadClients();
  }, [authLoading, profile]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const token = session?.access_token;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(inviteForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      setInviteSuccess(`Invitación enviada a ${inviteForm.email}`);
      setInviteForm({ email: "", full_name: "", company_name: "" });
      await loadClients();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setInviting(false);
    }
  };

  if (authLoading || !user) return null;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Clientes</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado
            {clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => { setShowInvite(true); setInviteError(null); setInviteSuccess(null); }}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          + Invitar Cliente
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <p className="text-sm text-zinc-500">Cargando clientes...</p>
          </div>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-600">
          {error}
        </div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
          <p className="text-2xl">👥</p>
          <p className="mt-2 font-medium text-zinc-700">No hay clientes aún</p>
          <p className="mt-1 text-sm text-zinc-400">
            Los clientes aparecerán aquí cuando creen su cuenta.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Cliente
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Progreso
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Última actividad
                </th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {clients.map((client) => {
                const progress = Math.round((client.submission_count / 11) * 100);
                const isPending = !!client.invited_at && client.submission_count === 0;
                return (
                  <tr key={client.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600">
                          {(client.full_name ?? "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-zinc-900">
                              {client.full_name ?? "—"}
                            </p>
                            {isPending && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                Pendiente
                              </span>
                            )}
                          </div>
                          {client.company_name && (
                            <p className="text-xs text-zinc-500">{client.company_name}</p>
                          )}
                          <p className="text-xs text-zinc-400">
                            Registrado {formatDate(client.created_at)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                          <span>{client.submission_count}/11 secciones</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                          <div
                            className="h-full rounded-full bg-blue-600 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-zinc-500">
                      {formatDate(client.last_activity)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/dashboard/admin/${client.id}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
                      >
                        Ver onboarding →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Invitar Cliente</h2>
              <button
                onClick={() => setShowInvite(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleInvite} className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Correo electrónico *
                </label>
                <input
                  type="email"
                  required
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="cliente@empresa.com"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Nombre completo
                </label>
                <input
                  type="text"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                  placeholder="Nombre del cliente"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  Empresa
                </label>
                <input
                  type="text"
                  value={inviteForm.company_name}
                  onChange={(e) => setInviteForm((f) => ({ ...f, company_name: e.target.value }))}
                  placeholder="Nombre de la empresa"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {inviteError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {inviteError}
                </p>
              )}
              {inviteSuccess && (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  ✓ {inviteSuccess}
                </p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={inviting}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                >
                  {inviting ? "Enviando..." : "Enviar invitación"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvite(false)}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
