"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { OnboardingTemplate, Profile, TemplateSection } from "@/lib/types";

interface ClientRow extends Profile {
  submission_count: number;
  last_activity: string | null;
  assigned_sections_count: number;
  template_name: string | null;
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
  role: "client" | "admin";
}

export default function AdminClientsPage() {
  const { user, session, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Templates for invite flow
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteStep, setInviteStep] = useState<1 | 2>(1);
  const [inviteForm, setInviteForm] = useState<InviteForm>({ email: "", full_name: "", company_name: "", role: "client" });
  const [inviteTemplateId, setInviteTemplateId] = useState<number | "">("");
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<number>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Parts for section preview in invite
  const [inviteParts, setInviteParts] = useState<{ id: number; title: string; part_number: number; sections: { id: number; title: string; section_order: number }[] }[]>([]);

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

      const { data: templatesData } = await supabase.from("onboarding_templates").select("id, name");
      const templateMap = new Map<number, string>((templatesData ?? []).map((t) => [t.id, t.name]));

      const { data: subsData } = await supabase
        .from("submissions")
        .select("client_id, updated_at");

      const { data: csData } = await supabase
        .from("client_sections")
        .select("client_id");

      const subsByClient: Record<string, { count: number; lastActivity: string }> = {};
      for (const sub of subsData ?? []) {
        if (!subsByClient[sub.client_id]) subsByClient[sub.client_id] = { count: 0, lastActivity: sub.updated_at };
        subsByClient[sub.client_id].count += 1;
        if (sub.updated_at > subsByClient[sub.client_id].lastActivity) {
          subsByClient[sub.client_id].lastActivity = sub.updated_at;
        }
      }

      const assignedByClient: Record<string, number> = {};
      for (const cs of csData ?? []) {
        assignedByClient[cs.client_id] = (assignedByClient[cs.client_id] ?? 0) + 1;
      }

      setClients(
        (profilesData ?? []).map((p) => ({
          ...p,
          submission_count: subsByClient[p.id]?.count ?? 0,
          last_activity: subsByClient[p.id]?.lastActivity ?? null,
          assigned_sections_count: assignedByClient[p.id] ?? 0,
          template_name: p.template_id ? (templateMap.get(p.template_id) ?? null) : null,
        }))
      );
    } catch {
      setError("Error al cargar los clientes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      loadClients();
      supabase.from("onboarding_templates").select("*").order("id").then(({ data }) => setTemplates(data ?? []));
      supabase.from("onboarding_parts").select("*").order("part_number").then(async ({ data: pData }) => {
        const { data: sData } = await supabase.from("onboarding_sections").select("*").order("section_order");
        setInviteParts((pData ?? []).map((p) => ({
          ...p,
          sections: (sData ?? []).filter((s) => s.part_id === p.id).sort((a, b) => a.section_order - b.section_order),
        })));
      });
    }
  }, [authLoading, profile]);

  const loadTemplateSections = async (templateId: number | "") => {
    setInviteTemplateId(templateId);
    if (!templateId) { setTemplateSections([]); setSelectedSectionIds(new Set()); return; }
    const { data } = await supabase.from("template_sections").select("*").eq("template_id", templateId);
    const ts = data ?? [];
    setTemplateSections(ts);
    setSelectedSectionIds(new Set(ts.map((s) => s.section_id)));
  };

  const openInvite = () => {
    setShowInvite(true);
    setInviteStep(1);
    setInviteForm({ email: "", full_name: "", company_name: "", role: "client" });
    setInviteTemplateId("");
    setTemplateSections([]);
    setSelectedSectionIds(new Set());
    setInviteError(null);
    setInviteSuccess(null);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const token = session?.access_token;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...inviteForm,
          template_id: inviteForm.role === "client" ? (inviteTemplateId || null) : null,
          section_ids: inviteForm.role === "client" && inviteTemplateId ? Array.from(selectedSectionIds) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setInviteSuccess(`Invitación enviada a ${inviteForm.email}`);
      setInviteForm({ email: "", full_name: "", company_name: "", role: "client" });
      setInviteStep(1);
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
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button onClick={openInvite} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
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
        <div className="rounded-xl border border-red-100 bg-red-50 p-6 text-center text-sm text-red-600">{error}</div>
      ) : clients.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center">
          <p className="text-2xl">👥</p>
          <p className="mt-2 font-medium text-zinc-700">No hay clientes aún</p>
          <p className="mt-1 text-sm text-zinc-400">Los clientes aparecerán aquí cuando creen su cuenta.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Cliente</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Plantilla</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Progreso</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-500">Última actividad</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {clients.map((client) => {
                const total = client.assigned_sections_count > 0 ? client.assigned_sections_count : 11;
                const progress = Math.round((client.submission_count / total) * 100);
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
                            <p className="font-medium text-zinc-900">{client.full_name ?? "—"}</p>
                            {isPending && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
                            )}
                          </div>
                          {client.company_name && <p className="text-xs text-zinc-500">{client.company_name}</p>}
                          <p className="text-xs text-zinc-400">Registrado {formatDate(client.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {client.template_name ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {client.template_name}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                          <span>{client.submission_count}/{total} secciones</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                          <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-zinc-500">{formatDate(client.last_activity)}</td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/dashboard/admin/${client.id}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
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
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Invitar Cliente</h2>
                <p className="text-xs text-zinc-400">Paso {inviteStep} de 2</p>
              </div>
              <button onClick={() => setShowInvite(false)} className="text-zinc-400 hover:text-zinc-600">✕</button>
            </div>

            <form onSubmit={inviteStep === 1 ? (e) => { e.preventDefault(); inviteForm.role === "admin" ? handleInvite(e) : setInviteStep(2); } : handleInvite}>
              {inviteStep === 1 ? (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Correo electrónico *</label>
                    <input type="email" required value={inviteForm.email}
                      onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                      placeholder="cliente@empresa.com"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Nombre completo</label>
                    <input type="text" value={inviteForm.full_name}
                      onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                      placeholder="Nombre del cliente"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Empresa</label>
                    <input type="text" value={inviteForm.company_name}
                      onChange={(e) => setInviteForm((f) => ({ ...f, company_name: e.target.value }))}
                      placeholder="Nombre de la empresa"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Rol</label>
                    <div className="flex gap-3">
                      {(["client", "admin"] as const).map((r) => (
                        <label key={r} className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${inviteForm.role === r ? "border-blue-500 bg-blue-50 text-blue-700" : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"}`}>
                          <input type="radio" name="invite-role" value={r} checked={inviteForm.role === r}
                            onChange={() => setInviteForm((f) => ({ ...f, role: r }))} className="sr-only" />
                          {r === "client" ? "👤 Cliente" : "🔑 Admin"}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-3 pt-1">
                    <button type="submit" className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      {inviteForm.role === "admin" ? "Enviar invitación" : "Siguiente →"}
                    </button>
                    <button type="button" onClick={() => setShowInvite(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Plantilla de onboarding</label>
                    <select value={inviteTemplateId} onChange={(e) => loadTemplateSections(e.target.value ? +e.target.value : "")}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                      <option value="">Sin plantilla (asignar secciones después)</option>
                      {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  {inviteTemplateId && templateSections.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-700">Secciones a asignar</p>
                        <span className="text-xs text-zinc-400">{selectedSectionIds.size} seleccionadas</span>
                      </div>
                      <div className="max-h-52 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 space-y-1">
                        {inviteParts.map((part) => {
                          const partTS = templateSections.filter((ts) => part.sections.some((s) => s.id === ts.section_id));
                          if (!partTS.length) return null;
                          return (
                            <div key={part.id}>
                              <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                Parte {part.part_number} — {part.title}
                              </p>
                              {partTS.map((ts) => {
                                const sec = part.sections.find((s) => s.id === ts.section_id);
                                return (
                                  <label key={ts.section_id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-white">
                                    <input type="checkbox" checked={selectedSectionIds.has(ts.section_id)}
                                      onChange={() => setSelectedSectionIds((prev) => {
                                        const next = new Set(prev);
                                        next.has(ts.section_id) ? next.delete(ts.section_id) : next.add(ts.section_id);
                                        return next;
                                      })}
                                      className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600" />
                                    <span className="text-sm text-zinc-700">{sec?.title}</span>
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {inviteError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{inviteError}</p>}
                  {inviteSuccess && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✓ {inviteSuccess}</p>}

                  <div className="flex gap-3 pt-1">
                    <button type="button" onClick={() => setInviteStep(1)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                      ← Atrás
                    </button>
                    <button type="submit" disabled={inviting} className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                      {inviting ? "Enviando..." : "Enviar invitación"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
