"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import { deriveStatus, adminColor, type ClientStatus } from "@/lib/clientStatus";
import InviteClientDialog from "./InviteClientDialog";
import type { Profile } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────

interface ClientRow {
  id: string;
  full_name: string | null;
  company_name: string | null;
  invited_at: string | null;
  template_id: number | null;
  project_id: string | null;
  created_at: string;
  // derived
  template: string | null;
  has_project: boolean;
  total: number;
  completed: number;
  phase: string | null;
  next_task: string | null;
  admin: { id: string; name: string };
  last_activity_at: string | null;
  status: ClientStatus;
  pending_validations: number;
  pending_info: number;
}

type TabKey = "todos" | "activos" | "no_activos" | "atascados";

// ── Helpers ──────────────────────────────────────────────────────

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const days = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 86_400_000
  );
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  if (days < 14) return "Hace 1 sem.";
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`;
  if (days < 60) return "Hace 1 mes";
  return `Hace ${Math.floor(days / 30)} meses`;
}

function daysAgo(dateStr: string | null): number {
  if (!dateStr) return 999;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Skeleton row ─────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr style={{ borderBottom: "1px solid #F3F4F6" }}>
      <td style={{ padding: "14px 20px" }}>
        <div className="flex items-center gap-3">
          <div className="skeleton shrink-0" style={{ width: 36, height: 36, borderRadius: "50%" }} />
          <div>
            <div className="skeleton" style={{ width: 140, height: 13, marginBottom: 5 }} />
            <div className="skeleton" style={{ width: 90, height: 11 }} />
          </div>
        </div>
      </td>
      <td style={{ padding: "14px 20px" }}>
        <div className="skeleton" style={{ width: 180, height: 13 }} />
      </td>
      <td style={{ padding: "14px 20px" }}>
        <div className="flex items-center gap-2">
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: "50%" }} />
          <div className="skeleton" style={{ width: 80, height: 12 }} />
        </div>
      </td>
      <td style={{ padding: "14px 20px" }}>
        <div className="skeleton" style={{ width: 60, height: 12 }} />
      </td>
      <td style={{ padding: "14px 20px" }}>
        <div className="skeleton" style={{ width: 70, height: 28, borderRadius: 7 }} />
      </td>
    </tr>
  );
}

// ── Component ────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const { user, session, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());

  const [activeTab, setActiveTab] = useState<TabKey>("todos");
  const [search, setSearch] = useState("");

  const [showInvite, setShowInvite] = useState(false);

  // Delete state (kept from existing functionality)
  const [deleteTarget, setDeleteTarget] = useState<ClientRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  // ── Data loading ───────────────────────────────────────────────

  const loadClients = async () => {
    setLoading(true);
    setError(null);

    // Timeout guard: 4 s
    const timeout = setTimeout(() => {
      setLoading(false);
      setError("La carga tardó demasiado. Intenta de nuevo.");
    }, 4000);

    try {
      const { data: profilesData, error: profilesErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "client")
        .order("created_at", { ascending: false });
      if (profilesErr) throw profilesErr;

      const profiles: Profile[] = profilesData ?? [];
      const profileIds = profiles.map((p) => p.id);
      const projectIds = profiles.filter((p) => p.project_id).map((p) => p.project_id!);

      // ── Legacy activity ──────────────────────────────────
      const { data: subsData } = await supabase
        .from("submissions")
        .select("client_id, updated_at");

      const subsActivity: Record<string, string> = {};
      for (const s of subsData ?? []) {
        if (!subsActivity[s.client_id] || s.updated_at > subsActivity[s.client_id]) {
          subsActivity[s.client_id] = s.updated_at;
        }
      }

      // ── Task-response activity ───────────────────────────
      const taskResponseActivity: Record<string, string> = {};
      if (profileIds.length > 0) {
        const { data: trData } = await supabase
          .from("task_responses")
          .select("client_id, updated_at")
          .in("client_id", profileIds);
        for (const tr of trData ?? []) {
          if (!taskResponseActivity[tr.client_id] || tr.updated_at > taskResponseActivity[tr.client_id]) {
            taskResponseActivity[tr.client_id] = tr.updated_at;
          }
        }
      }

      // ── Legacy template names ────────────────────────────
      const { data: legacyTpls } = await supabase.from("onboarding_templates").select("id, name");
      const legacyTplMap = new Map<number, string>((legacyTpls ?? []).map((t) => [t.id, t.name]));

      // ── Project data ─────────────────────────────────────
      const projectTemplateByProjectId = new Map<string, string>();
      const phaseIdToProjectId = new Map<string, string>();
      const phaseNumberById = new Map<string, number>();
      interface TaskData {
        id: string;
        phase_id: string;
        status: string;
        name: string;
        task_type: string;
        sort_order: number | null;
      }
      let allTasks: TaskData[] = [];

      if (projectIds.length > 0) {
        const { data: projectsData } = await supabase
          .from("client_projects")
          .select("id, template_id")
          .in("id", projectIds);

        const usedTemplateIds = [...new Set(
          (projectsData ?? []).map((p) => p.template_id).filter(Boolean)
        )];

        if (usedTemplateIds.length > 0) {
          const { data: ptData } = await supabase
            .from("project_templates")
            .select("id, name")
            .in("id", usedTemplateIds);
          const ptMap = new Map((ptData ?? []).map((t) => [t.id, t.name]));
          for (const p of projectsData ?? []) {
            if (p.template_id) {
              projectTemplateByProjectId.set(p.id, ptMap.get(p.template_id) ?? "");
            }
          }
        }

        const { data: phasesData } = await supabase
          .from("client_phases")
          .select("id, project_id, phase_number")
          .in("project_id", projectIds);

        for (const p of phasesData ?? []) {
          phaseIdToProjectId.set(p.id, p.project_id);
          phaseNumberById.set(p.id, p.phase_number);
        }

        const phaseIds = (phasesData ?? []).map((p) => p.id);
        if (phaseIds.length > 0) {
          const { data: tasksData } = await supabase
            .from("client_tasks")
            .select("id, phase_id, status, name, task_type, sort_order")
            .in("phase_id", phaseIds);
          allTasks = tasksData ?? [];
        }
      }

      // Group tasks by project_id
      const tasksByProject: Record<string, TaskData[]> = {};
      for (const t of allTasks) {
        const pid = phaseIdToProjectId.get(t.phase_id);
        if (!pid) continue;
        if (!tasksByProject[pid]) tasksByProject[pid] = [];
        tasksByProject[pid].push(t);
      }

      // Current admin for "admin" column
      const adminId = profile?.id ?? "";
      const adminName = profile?.full_name ?? "Admin";

      setClients(
        profiles.map((p) => {
          const hasProject = !!p.project_id;
          const pTasks = hasProject ? (tasksByProject[p.project_id!] ?? []) : [];
          const total = pTasks.length;
          const completed = pTasks.filter((t) => t.status === "completed").length;

          // Pending counts
          const pending_validations = pTasks.filter(
            (t) => t.task_type === "validation" && t.status !== "completed"
          ).length;
          const pending_info = pTasks.filter(
            (t) => t.task_type === "info_request" && t.status !== "completed"
          ).length;

          // Next task: first non-completed, sorted by phase_number then sort_order
          const nextTaskObj = pTasks
            .filter((t) => t.status !== "completed")
            .sort((a, b) => {
              const pa = phaseNumberById.get(a.phase_id) ?? 0;
              const pb = phaseNumberById.get(b.phase_id) ?? 0;
              if (pa !== pb) return pa - pb;
              return (a.sort_order ?? 0) - (b.sort_order ?? 0);
            })[0];
          const next_task = nextTaskObj?.name ?? null;

          // Last activity: max of task_responses, submissions
          const dates = [
            taskResponseActivity[p.id],
            subsActivity[p.id],
          ].filter(Boolean);
          const last_activity_at = dates.length
            ? dates.reduce((a, b) => (a > b ? a : b))
            : null;

          const phase = null;

          const status = deriveStatus({
            has_project: hasProject,
            total,
            completed,
            last_activity_at,
            invited_at: p.invited_at,
          });

          return {
            id: p.id,
            full_name: p.full_name,
            company_name: p.company_name,
            invited_at: p.invited_at,
            template_id: p.template_id,
            project_id: p.project_id,
            created_at: p.created_at,
            template: hasProject
              ? (projectTemplateByProjectId.get(p.project_id!) ?? null)
              : p.template_id
              ? (legacyTplMap.get(p.template_id) ?? null)
              : null,
            has_project: hasProject,
            total,
            completed,
            phase,
            next_task,
            admin: { id: adminId, name: adminName },
            last_activity_at,
            status,
            pending_validations,
            pending_info,
          };
        })
      );

      setLastRefreshed(new Date());
    } catch {
      setError("Error al cargar los clientes.");
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") loadClients();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, profile]);

  // ── Delete handler ────────────────────────────────────────────

  const handleDeleteClient = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const token = session?.access_token;
      const res = await fetch("/api/admin/delete-client", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId: deleteTarget.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      setDeleteTarget(null);
      await loadClients();
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeleting(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────

  const tabCounts = useMemo(() => ({
    todos: clients.length,
    activos: clients.filter(
      (c) => c.has_project && c.status !== "completed" && c.status !== "stuck" && c.status !== "at_risk"
    ).length,
    no_activos: clients.filter(
      (c) => c.status === "pending" || c.status === "completed"
    ).length,
    atascados: clients.filter(
      (c) => c.status === "stuck" || c.status === "at_risk"
    ).length,
  }), [clients]);

  const filtered = useMemo(() => {
    let list = clients;
    switch (activeTab) {
      case "activos":
        list = list.filter(
          (c) => c.has_project && c.status !== "completed" && c.status !== "stuck" && c.status !== "at_risk"
        );
        break;
      case "no_activos":
        list = list.filter((c) => c.status === "pending" || c.status === "completed");
        break;
      case "atascados":
        list = list.filter((c) => c.status === "stuck" || c.status === "at_risk");
        break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          (c.full_name ?? "").toLowerCase().includes(q) ||
          (c.company_name ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [clients, activeTab, search]);

  const minutesSinceRefresh = Math.floor(
    (Date.now() - lastRefreshed.getTime()) / 60_000
  );

  if (authLoading || !user) return null;

  // ── Tab definitions ──────────────────────────────────────────

  const TABS: { key: TabKey; label: string }[] = [
    { key: "todos",      label: "Todos" },
    { key: "activos",    label: "Activos" },
    { key: "no_activos", label: "No activos" },
    { key: "atascados",  label: "Atascados" },
  ];

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px 28px", fontFamily: "Inter, sans-serif" }}>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", color: "#111827", margin: 0 }}>
            Clientes
          </h1>
          <p style={{ fontSize: 13, color: "#6B7280", marginTop: 3 }}>
            Gestiona a tus {clients.length} cliente{clients.length !== 1 ? "s" : ""} en onboarding y seguimiento
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Reenviar invitaciones */}
          <button
            onClick={() => {}}
            className="flex items-center gap-1.5"
            style={{
              padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 500,
              color: "#374151", background: "#fff", border: "1px solid #E5E7EB",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M2 3l16 7-16 7V11l11-1-11-1V3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
            Reenviar invitaciones
          </button>
          {/* Invitar cliente */}
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-1.5"
            style={{
              padding: "8px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600,
              color: "#fff", background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
              border: "none", cursor: "pointer",
              boxShadow: "0 3px 12px rgba(109,40,217,0.30)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Invitar cliente
          </button>
        </div>
      </div>

      {/* ── Main card ───────────────────────────────────────── */}
      <div
        style={{
          background: "#fff", borderRadius: 12,
          border: "1px solid #E5E7EB", overflow: "hidden",
        }}
      >
        {/* Filter bar */}
        {(clients.length > 0 || loading) && (
          <div
            className="flex flex-wrap items-center justify-between gap-3"
            style={{ padding: "14px 20px", borderBottom: "1px solid #F3F4F6" }}
          >
            {/* Tabs */}
            <div className="flex flex-wrap items-center gap-1">
              {TABS.map(({ key, label }) => {
                const active = activeTab === key;
                const count = tabCounts[key];
                return (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className="flex items-center gap-1.5"
                    style={{
                      padding: "5px 10px", borderRadius: 7, border: "none",
                      cursor: "pointer", fontSize: 13, fontWeight: 500,
                      background: active
                        ? "linear-gradient(135deg, #4F46E5, #6D28D9)"
                        : "transparent",
                      color: active ? "#fff" : "#4B5563",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600,
                        padding: "1px 6px", borderRadius: 999,
                        background: active ? "rgba(255,255,255,0.22)" : "#F3F4F6",
                        color: active ? "#fff" : "#4B5563",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Search + Filtros */}
            <div className="flex items-center gap-2">
              <div className="relative" style={{ width: 260 }}>
                <svg
                  width="14" height="14" viewBox="0 0 20 20" fill="none"
                  className="absolute"
                  style={{ left: 10, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", pointerEvents: "none" }}
                >
                  <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M13 13l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  type="search"
                  placeholder="Buscar por nombre o empresa"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box",
                    padding: "7px 10px 7px 30px", borderRadius: 8,
                    border: "1px solid #E5E7EB", fontSize: 13, color: "#111827",
                    background: "#F9FAFB", outline: "none",
                  }}
                />
              </div>
              <button
                style={{
                  padding: "7px 12px", borderRadius: 8, fontSize: 13, fontWeight: 500,
                  color: "#374151", background: "#fff", border: "1px solid #E5E7EB",
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M3 5h14M6 10h8M9 15h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                Filtros
              </button>
            </div>
          </div>
        )}

        {/* ── Body ──────────────────────────────────────────── */}

        {/* Error */}
        {!loading && error && (
          <div style={{ padding: 24, textAlign: "center", color: "#DC2626", fontSize: 13 }}>
            {error}{" "}
            <button
              onClick={loadClients}
              style={{ color: "#4F46E5", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Zero clients ever */}
        {!loading && !error && clients.length === 0 && (
          <div style={{ padding: "64px 24px", textAlign: "center" }}>
            <div
              className="inline-flex items-center justify-center"
              style={{
                width: 64, height: 64, borderRadius: "50%",
                background: "#EEF2FF", marginBottom: 16,
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 3-1.34 3-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5C15 14.17 10.33 13 8 13zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" fill="#4F46E5" />
                <path d="M12 7v6M9 10h6" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
              Aún no tienes clientes
            </p>
            <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
              Invita a tu primer cliente para empezar el onboarding
            </p>
            <button
              onClick={() => setShowInvite(true)}
              style={{
                padding: "10px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                color: "#fff", background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                border: "none", cursor: "pointer",
                boxShadow: "0 3px 12px rgba(109,40,217,0.30)",
              }}
            >
              Invitar cliente
            </button>
          </div>
        )}

        {/* Table */}
        {(loading || (!error && clients.length > 0)) && (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F9FAFB" }}>
                  {["Cliente", "Próxima tarea", "Admin", "Última actividad", ""].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: "10px 20px", textAlign: "left",
                        fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "#6B7280",
                        borderBottom: "1px solid #F3F4F6",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                  : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={5} style={{ padding: "48px 24px", textAlign: "center" }}>
                        {search ? (
                          <>
                            <p style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 8 }}>
                              No encontramos clientes
                            </p>
                            <button
                              onClick={() => setSearch("")}
                              style={{ fontSize: 13, color: "#4F46E5", background: "none", border: "none", cursor: "pointer" }}
                            >
                              Limpiar búsqueda
                            </button>
                          </>
                        ) : (
                          <>
                            <p style={{ fontSize: 14, fontWeight: 500, color: "#374151", marginBottom: 4 }}>
                              Todo al día 🎉
                            </p>
                            <p style={{ fontSize: 13, color: "#9CA3AF" }}>
                              No hay clientes en esta categoría
                            </p>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                  : filtered.map((client) => {
                    const stale = daysAgo(client.last_activity_at) >= 14;
                    const aColor = adminColor(client.admin.name);

                    return (
                      <tr
                        key={client.id}
                        className="group"
                        onClick={() => router.push(`/dashboard/admin/clients/${client.id}`)}
                        style={{
                          borderBottom: "1px solid #F3F4F6",
                          cursor: "pointer",
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#F9FAFB")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}
                      >
                        {/* Cliente */}
                        <td style={{ padding: "14px 20px" }}>
                          <div className="flex items-center gap-3">
                            <div
                              className="flex shrink-0 items-center justify-center font-semibold"
                              style={{
                                width: 36, height: 36, borderRadius: "50%",
                                background: "#EEF2FF", color: "#4F46E5", fontSize: 13,
                              }}
                            >
                              {initials(client.full_name)}
                            </div>
                            <div>
                              <p style={{ fontSize: 13.5, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                                {client.full_name ?? "—"}
                              </p>
                              {client.company_name && (
                                <div className="flex items-center gap-1">
                                  <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                                    <path d="M4 17V7l6-4 6 4v10H4zM10 17v-5H7v5" stroke="#9CA3AF" strokeWidth="1.5" strokeLinejoin="round" />
                                  </svg>
                                  <span style={{ fontSize: 11.5, color: "#6B7280" }}>
                                    {client.company_name}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Próxima tarea */}
                        <td style={{ padding: "14px 20px", maxWidth: 260 }}>
                          {client.status === "completed" ? (
                            <div className="flex items-center gap-1.5">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                <circle cx="10" cy="10" r="8" fill="#EEF2FF" />
                                <path d="M6.5 10l2.5 2.5 4.5-5" stroke="#4F46E5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span style={{ fontSize: 12.5, color: "#4F46E5", fontWeight: 500 }}>
                                Onboarding completado
                              </span>
                            </div>
                          ) : client.status === "pending" ? (
                            <span style={{ fontSize: 12.5, color: "#6B7280", fontStyle: "italic" }}>
                              Invitación enviada
                            </span>
                          ) : client.next_task ? (
                            <span
                              className="block truncate"
                              style={{ fontSize: 12.5, color: "#374151", maxWidth: 260 }}
                              title={client.next_task}
                            >
                              {client.next_task}
                            </span>
                          ) : (
                            <span style={{ color: "#9CA3AF" }}>—</span>
                          )}
                        </td>

                        {/* Admin */}
                        <td style={{ padding: "14px 20px" }}>
                          <div className="flex items-center gap-2">
                            <div
                              className="flex shrink-0 items-center justify-center"
                              style={{
                                width: 24, height: 24, borderRadius: "50%",
                                background: aColor, color: "#fff", fontSize: 10, fontWeight: 600,
                              }}
                            >
                              {initials(client.admin.name)}
                            </div>
                            <span style={{ fontSize: 12.5, color: "#4B5563" }}>
                              {client.admin.name}
                            </span>
                          </div>
                        </td>

                        {/* Última actividad */}
                        <td style={{ padding: "14px 20px", whiteSpace: "nowrap" }}>
                          {stale ? (
                            <div className="flex items-center gap-1.5">
                              <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
                                <circle cx="10" cy="10" r="8" stroke="#4F46E5" strokeWidth="1.5" />
                                <path d="M10 6v4.5l2.5 2.5" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" />
                              </svg>
                              <span style={{ fontSize: 12.5, color: "#4F46E5", fontWeight: 600 }}>
                                {relativeTime(client.last_activity_at)}
                              </span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 12.5, color: "#4B5563" }}>
                              {relativeTime(client.last_activity_at)}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td
                          style={{ padding: "14px 20px", textAlign: "right" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/dashboard/admin/clients/${client.id}`}
                              className="flex items-center gap-1"
                              style={{
                                padding: "5px 10px", borderRadius: 7, fontSize: 11.5,
                                fontWeight: 600, color: "#4F46E5",
                                background: "#fff", border: "1px solid #E5E7EB",
                                textDecoration: "none", whiteSpace: "nowrap",
                              }}
                            >
                              Ver portal
                              <svg width="11" height="11" viewBox="0 0 20 20" fill="none">
                                <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </Link>
                            <button
                              onClick={() => { setDeleteTarget(client); setDeleteError(null); }}
                              title="Eliminar cliente"
                              className="opacity-0 group-hover:opacity-100"
                              style={{
                                width: 28, height: 28, borderRadius: 7,
                                border: "1px solid #E5E7EB", background: "#fff",
                                color: "#9CA3AF", cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                transition: "all 0.15s",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLElement).style.borderColor = "#FECACA";
                                (e.currentTarget as HTMLElement).style.background = "#FEF2F2";
                                (e.currentTarget as HTMLElement).style.color = "#DC2626";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLElement).style.borderColor = "#E5E7EB";
                                (e.currentTarget as HTMLElement).style.background = "#fff";
                                (e.currentTarget as HTMLElement).style.color = "#9CA3AF";
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
                                <path d="M2 3.5h10M5.5 3.5V2h3v1.5M4 3.5l.7 7.5h4.6l.7-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        {!loading && !error && clients.length > 0 && (
          <div
            className="flex items-center justify-between"
            style={{ padding: "10px 20px", borderTop: "1px solid #F3F4F6" }}
          >
            <p style={{ fontSize: 11.5, color: "#6B7280" }}>
              Mostrando {filtered.length} de {clients.length} cliente{clients.length !== 1 ? "s" : ""}
            </p>
            <p style={{ fontSize: 11.5, color: "#6B7280" }}>
              {minutesSinceRefresh === 0
                ? "Actualizado hace menos de 1 min"
                : `Actualizado hace ${minutesSinceRefresh} min`}
            </p>
          </div>
        )}
      </div>

      {/* ── Invite Dialog ────────────────────────────────────── */}
      <InviteClientDialog
        open={showInvite}
        onClose={() => setShowInvite(false)}
        onSuccess={loadClients}
        accessToken={session?.access_token ?? null}
      />

      {/* ── Delete confirmation modal ────────────────────────── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(17,24,39,0.55)", backdropFilter: "blur(4px)" }}
        >
          <div
            style={{
              width: "100%", maxWidth: 440, borderRadius: 16,
              background: "#fff", boxShadow: "0 16px 48px rgba(0,0,0,0.16)",
            }}
          >
            <div className="flex items-start gap-4 p-6">
              <div
                className="flex shrink-0 items-center justify-center"
                style={{ width: 40, height: 40, borderRadius: "50%", background: "#FEF2F2" }}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 6v4M9 13v.5" stroke="#DC2626" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M7.5 2.5L1.5 13a1.7 1.7 0 0 0 1.5 2.5h12a1.7 1.7 0 0 0 1.5-2.5L10.5 2.5a1.7 1.7 0 0 0-3 0z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 style={{ fontSize: 15, fontWeight: 600, color: "#111827", marginBottom: 6 }}>
                  Eliminar cliente
                </h3>
                <p style={{ fontSize: 13, color: "#6B7280", marginBottom: 12 }}>
                  ¿Estás seguro de que quieres eliminar a{" "}
                  <strong style={{ color: "#374151" }}>
                    {deleteTarget.full_name ?? deleteTarget.company_name ?? deleteTarget.id}
                  </strong>
                  ?
                </p>
                <ul style={{ background: "#FEF2F2", borderRadius: 8, padding: "10px 14px", margin: "0 0 8px", fontSize: 12, color: "#B91C1C", lineHeight: 1.8 }}>
                  <li>• Su cuenta de usuario</li>
                  <li>• Su proyecto y todas sus tareas</li>
                  <li>• Todas sus respuestas y archivos</li>
                  <li>• Todo su progreso y datos</li>
                </ul>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#DC2626" }}>Esta acción NO se puede deshacer.</p>
                {deleteError && (
                  <p style={{ marginTop: 8, fontSize: 12, color: "#DC2626", background: "#FEF2F2", borderRadius: 6, padding: "6px 10px" }}>
                    {deleteError}
                  </p>
                )}
              </div>
            </div>
            <div
              className="flex gap-3"
              style={{ borderTop: "1px solid #F3F4F6", padding: "14px 24px" }}
            >
              <button
                onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
                disabled={deleting}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13,
                  fontWeight: 500, color: "#374151", background: "#fff",
                  border: "1px solid #E5E7EB", cursor: "pointer", opacity: deleting ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={deleting}
                style={{
                  flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13,
                  fontWeight: 600, color: "#fff", background: "#DC2626",
                  border: "none", cursor: "pointer", opacity: deleting ? 0.5 : 1,
                }}
              >
                {deleting ? "Eliminando..." : "Eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
