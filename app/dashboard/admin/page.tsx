"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { Profile, ProjectTemplate, TaskType, OwnerType } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────

interface ClientRow extends Profile {
  has_project: boolean;
  project_progress: number;
  project_total_tasks: number;
  project_completed_tasks: number;
  project_template_name: string | null;
  // legacy
  submission_count: number;
  last_activity: string | null;
  template_name: string | null;
}

interface PhaseTaskPreview {
  id: string;
  name: string;
  phase_number: number;
  tasks: { id: string; name: string; task_type: TaskType; owner_type: OwnerType }[];
}

interface InviteForm {
  email: string;
  full_name: string;
  company_name: string;
  owner_label: string;
  role: "client" | "admin";
}

// ── Helpers ──────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Sin actividad";
  return new Date(dateStr).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function createProjectFromTemplate(
  clientId: string,
  templateId: string,
  ownerLabel: string,
  companyName: string,
  excludedTaskTemplateIds: string[] = []
) {
  const { data: project, error: projectError } = await supabase
    .from("client_projects")
    .insert({
      client_id: clientId,
      template_id: templateId,
      name: `Proyecto ${companyName}`,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (projectError || !project) throw new Error(projectError?.message ?? "Error creating project");

  const { data: phaseTemplates } = await supabase
    .from("phase_templates")
    .select("id, name, phase_number")
    .eq("template_id", templateId)
    .order("phase_number");

  if (!phaseTemplates || phaseTemplates.length === 0) {
    await supabase.from("profiles").update({ project_id: project.id }).eq("id", clientId);
    return project;
  }

  const ptIds = phaseTemplates.map((p) => p.id);

  const { data: taskTemplates } = await supabase
    .from("task_templates")
    .select("id, phase_template_id, name, task_type, owner_type, default_due_offset_days, sort_order, description")
    .in("phase_template_id", ptIds)
    .order("sort_order");

  const ttIds = (taskTemplates ?? []).map((t) => t.id);

  let questionTemplates: Array<{
    id: string;
    task_template_id: string;
    question_text: string;
    placeholder: string | null;
    sort_order: number | null;
  }> = [];
  if (ttIds.length > 0) {
    const { data: qtData } = await supabase
      .from("question_templates")
      .select("id, task_template_id, question_text, placeholder, sort_order")
      .in("task_template_id", ttIds)
      .order("sort_order");
    questionTemplates = qtData ?? [];
  }

  const tasksByPhase = new Map<string, typeof taskTemplates>();
  for (const tt of taskTemplates ?? []) {
    if (!tasksByPhase.has(tt.phase_template_id)) tasksByPhase.set(tt.phase_template_id, []);
    tasksByPhase.get(tt.phase_template_id)!.push(tt);
  }

  const questionsByTask = new Map<string, typeof questionTemplates>();
  for (const qt of questionTemplates) {
    if (!questionsByTask.has(qt.task_template_id)) questionsByTask.set(qt.task_template_id, []);
    questionsByTask.get(qt.task_template_id)!.push(qt);
  }

  for (const pt of phaseTemplates) {
    const { data: phase } = await supabase
      .from("client_phases")
      .insert({
        project_id: project.id,
        phase_template_id: pt.id,
        name: pt.name,
        phase_number: pt.phase_number,
      })
      .select()
      .single();

    if (!phase) continue;

    const phaseTasks = (tasksByPhase.get(pt.id) ?? []).filter(
      (tt) => !excludedTaskTemplateIds.includes(tt.id)
    );

    for (const tt of phaseTasks) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + (tt.default_due_offset_days ?? 0));

      const { data: task } = await supabase
        .from("client_tasks")
        .insert({
          phase_id: phase.id,
          task_template_id: tt.id,
          name: tt.name,
          task_type: tt.task_type,
          owner_type: tt.owner_type,
          owner_label: tt.owner_type === "client" ? ownerLabel : "VAMBE",
          due_date: dueDate.toISOString().split("T")[0],
          sort_order: tt.sort_order ?? 0,
          description: tt.description,
          status: "pending",
          progress: 0,
        })
        .select()
        .single();

      if (!task) continue;

      const taskQuestions = questionsByTask.get(tt.id) ?? [];
      if (tt.task_type === "info_request" && taskQuestions.length > 0) {
        await supabase.from("task_questions").insert(
          taskQuestions.map((qt) => ({
            task_id: task.id,
            question_template_id: qt.id,
            question_text: qt.question_text,
            placeholder: qt.placeholder,
            sort_order: qt.sort_order,
          }))
        );
      }

      if (tt.task_type === "validation") {
        await supabase.from("task_validations").insert({ task_id: task.id });
      }
    }
  }

  await supabase.from("profiles").update({ project_id: project.id }).eq("id", clientId);
  return project;
}

// ── Component ────────────────────────────────────────────────────

export default function AdminClientsPage() {
  const { user, session, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteStep, setInviteStep] = useState<1 | 2 | 3>(1);
  const [inviteForm, setInviteForm] = useState<InviteForm>({
    email: "",
    full_name: "",
    company_name: "",
    owner_label: "",
    role: "client",
  });
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Step 2: project template selection
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedProjectTemplateId, setSelectedProjectTemplateId] = useState<string>("");
  const [loadingTemplates, setLoadingTemplates] = useState(false);

  // Step 3: task preview
  const [phaseTaskPreview, setPhaseTaskPreview] = useState<PhaseTaskPreview[]>([]);
  const [excludedTaskIds, setExcludedTaskIds] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);

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

      const profiles = profilesData ?? [];
      const profileIds = profiles.map((p) => p.id);

      // ── Legacy data (submissions + sections) ──
      const { data: subsData } = await supabase
        .from("submissions")
        .select("client_id, updated_at");

      const subsByClient: Record<string, { count: number; lastActivity: string }> = {};
      for (const sub of subsData ?? []) {
        if (!subsByClient[sub.client_id]) subsByClient[sub.client_id] = { count: 0, lastActivity: sub.updated_at };
        subsByClient[sub.client_id].count += 1;
        if (sub.updated_at > subsByClient[sub.client_id].lastActivity) {
          subsByClient[sub.client_id].lastActivity = sub.updated_at;
        }
      }

      // ── Legacy template names ──
      const { data: legacyTemplatesData } = await supabase
        .from("onboarding_templates")
        .select("id, name");
      const legacyTemplateMap = new Map<number, string>(
        (legacyTemplatesData ?? []).map((t) => [t.id, t.name])
      );

      // ── Project data ──
      const projectIds = profiles.filter((p) => p.project_id).map((p) => p.project_id!);

      let projectTemplateMap = new Map<string, string>();
      let phaseIdToProjectId = new Map<string, string>();
      let taskProgressByProject: Record<string, { total: number; completed: number }> = {};

      if (projectIds.length > 0) {
        // Get project template info
        const { data: projectsData } = await supabase
          .from("client_projects")
          .select("id, client_id, template_id")
          .in("id", projectIds);

        const usedTemplateIds = [...new Set(
          (projectsData ?? []).map((p) => p.template_id).filter(Boolean)
        )];

        if (usedTemplateIds.length > 0) {
          const { data: ptData } = await supabase
            .from("project_templates")
            .select("id, name")
            .in("id", usedTemplateIds);
          projectTemplateMap = new Map((ptData ?? []).map((t) => [t.id, t.name]));
        }

        // Map project_id → template name
        const projectToTemplate = new Map(
          (projectsData ?? []).map((p) => [p.id, p.template_id ?? ""])
        );

        // Fetch phases for all projects
        const { data: phasesData } = await supabase
          .from("client_phases")
          .select("id, project_id")
          .in("project_id", projectIds);

        const phaseIds = (phasesData ?? []).map((p) => p.id);
        for (const p of phasesData ?? []) {
          phaseIdToProjectId.set(p.id, p.project_id);
        }

        // Fetch tasks for all phases
        if (phaseIds.length > 0) {
          const { data: tasksData } = await supabase
            .from("client_tasks")
            .select("id, phase_id, status")
            .in("phase_id", phaseIds);

          for (const t of tasksData ?? []) {
            const pid = phaseIdToProjectId.get(t.phase_id);
            if (!pid) continue;
            if (!taskProgressByProject[pid]) taskProgressByProject[pid] = { total: 0, completed: 0 };
            taskProgressByProject[pid].total++;
            if (t.status === "completed") taskProgressByProject[pid].completed++;
          }
        }

        // Build projectId → template name map for use below
        for (const [pid, tid] of projectToTemplate.entries()) {
          const name = projectTemplateMap.get(tid) ?? null;
          if (name) projectTemplateMap.set(pid, name);
        }
      }

      setClients(
        profiles.map((p) => {
          const hasProject = !!p.project_id;
          const pdata = hasProject ? taskProgressByProject[p.project_id!] : null;
          const totalTasks = pdata?.total ?? 0;
          const completedTasks = pdata?.completed ?? 0;
          const projectProgress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

          // Get project template name: stored by project_id key in projectTemplateMap
          const projectTemplateName = hasProject
            ? (projectTemplateMap.get(p.project_id!) ?? null)
            : null;

          return {
            ...p,
            has_project: hasProject,
            project_progress: projectProgress,
            project_total_tasks: totalTasks,
            project_completed_tasks: completedTasks,
            project_template_name: projectTemplateName,
            submission_count: subsByClient[p.id]?.count ?? 0,
            last_activity: subsByClient[p.id]?.lastActivity ?? null,
            template_name: p.template_id ? (legacyTemplateMap.get(p.template_id) ?? null) : null,
          };
        })
      );
    } catch {
      setError("Error al cargar los clientes.");
    } finally {
      setLoading(false);
    }
  };

  const loadProjectTemplates = async () => {
    setLoadingTemplates(true);
    const { data } = await supabase
      .from("project_templates")
      .select("*")
      .order("name");
    setProjectTemplates(data ?? []);
    setLoadingTemplates(false);
  };

  const loadTaskPreview = async (templateId: string) => {
    setLoadingPreview(true);
    setSelectedProjectTemplateId(templateId);

    const { data: phases } = await supabase
      .from("phase_templates")
      .select("id, name, phase_number")
      .eq("template_id", templateId)
      .order("phase_number");

    const phaseIds = (phases ?? []).map((p) => p.id);

    const { data: tasks } = phaseIds.length > 0
      ? await supabase
          .from("task_templates")
          .select("id, name, task_type, owner_type, phase_template_id, sort_order")
          .in("phase_template_id", phaseIds)
          .order("sort_order")
      : { data: [] };

    const preview: PhaseTaskPreview[] = (phases ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      phase_number: p.phase_number,
      tasks: (tasks ?? [])
        .filter((t) => t.phase_template_id === p.id)
        .map((t) => ({ id: t.id, name: t.name, task_type: t.task_type as TaskType, owner_type: t.owner_type as OwnerType })),
    }));

    setPhaseTaskPreview(preview);
    setExcludedTaskIds(new Set());
    setLoadingPreview(false);
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") {
      loadClients();
    }
  }, [authLoading, profile]);

  const resetInviteForm = () => {
    setInviteForm({ email: "", full_name: "", company_name: "", owner_label: "", role: "client" });
    setSelectedProjectTemplateId("");
    setPhaseTaskPreview([]);
    setExcludedTaskIds(new Set());
    setInviteStep(1);
    setInviteError(null);
    setInviteSuccess(null);
  };

  const openInvite = () => {
    resetInviteForm();
    setShowInvite(true);
    loadProjectTemplates();
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (inviteForm.role === "admin") {
      handleInvite();
    } else {
      setInviteStep(2);
    }
  };

  const handleStep2Next = () => {
    if (!selectedProjectTemplateId) return;
    loadTaskPreview(selectedProjectTemplateId);
    setInviteStep(3);
  };

  const handleInvite = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setInviting(true);
    setInviteError(null);
    setInviteSuccess(null);
    try {
      const token = session?.access_token;
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: inviteForm.email,
          full_name: inviteForm.full_name,
          company_name: inviteForm.company_name,
          role: inviteForm.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      const clientId = data.userId;

      if (inviteForm.role === "client" && selectedProjectTemplateId && clientId) {
        await createProjectFromTemplate(
          clientId,
          selectedProjectTemplateId,
          (inviteForm.owner_label || inviteForm.company_name).toUpperCase(),
          inviteForm.company_name,
          Array.from(excludedTaskIds)
        );
      }

      setInviteSuccess(`Invitación enviada a ${inviteForm.email}`);
      resetInviteForm();
      await loadClients();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setInviting(false);
    }
  };

  if (authLoading || !user) return null;

  const TASK_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    hito: { bg: "#F1F5F9", text: "#64748B", label: "Hito" },
    info_request: { bg: "#FFFBEB", text: "#D97706", label: "Info" },
    validation: { bg: "#EEF2FF", text: "#4F46E5", label: "Valid." },
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Clientes</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {clients.length} cliente{clients.length !== 1 ? "s" : ""} registrado{clients.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={openInvite}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
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
                const isPending = !!client.invited_at && !client.has_project && client.submission_count === 0;
                const templateName = client.project_template_name ?? client.template_name;

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
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                Pendiente
                              </span>
                            )}
                            {client.has_project && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                Portal activo
                              </span>
                            )}
                          </div>
                          {client.company_name && (
                            <p className="text-xs text-zinc-500">{client.company_name}</p>
                          )}
                          <p className="text-xs text-zinc-400">Registrado {formatDate(client.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {templateName ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {templateName}
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {client.has_project ? (
                        <div>
                          <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-500">
                            <span>{client.project_completed_tasks}/{client.project_total_tasks} tareas</span>
                            <span>{client.project_progress}%</span>
                          </div>
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                            <div
                              className="h-full rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${client.project_progress}%` }}
                            />
                          </div>
                        </div>
                      ) : client.submission_count > 0 ? (
                        <div>
                          <div className="mb-1.5 text-xs text-zinc-500">
                            {client.submission_count} sección{client.submission_count !== 1 ? "es" : ""} (legacy)
                          </div>
                          <div className="h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                            <div className="h-full w-1/4 rounded-full bg-blue-400" />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400">Sin datos</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-zinc-500">
                      {formatDate(client.last_activity)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/dashboard/admin/clients/${client.id}`}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                      >
                        Ver portal →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Invite Modal ─────────────────────────────────────── */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white shadow-xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Invitar Cliente</h2>
                <div className="mt-1 flex gap-1">
                  {([1, 2, 3] as const).map((s) => (
                    <div
                      key={s}
                      style={{
                        width: inviteForm.role === "admin" ? "100%" : "33.33%",
                        display: inviteForm.role === "admin" && s > 1 ? "none" : "block",
                      }}
                    >
                      <div
                        className={`h-1 rounded-full transition-colors ${
                          inviteStep >= s ? "bg-blue-500" : "bg-zinc-200"
                        }`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-xs text-zinc-400">
                  {inviteForm.role === "admin"
                    ? "Paso 1 de 1"
                    : `Paso ${inviteStep} de 3`}
                </p>
              </div>
              <button
                onClick={() => setShowInvite(false)}
                className="text-zinc-400 hover:text-zinc-600"
              >
                ✕
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
              {/* ── Step 1: Client info ── */}
              {inviteStep === 1 && (
                <form onSubmit={handleStep1Next} className="space-y-4">
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
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Nombre completo</label>
                    <input
                      type="text"
                      value={inviteForm.full_name}
                      onChange={(e) => setInviteForm((f) => ({ ...f, full_name: e.target.value }))}
                      placeholder="Nombre del cliente"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Empresa</label>
                    <input
                      type="text"
                      value={inviteForm.company_name}
                      onChange={(e) =>
                        setInviteForm((f) => ({
                          ...f,
                          company_name: e.target.value,
                          owner_label: f.owner_label || e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="Nombre de la empresa"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">
                      Etiqueta del cliente
                      <span className="ml-1 text-xs font-normal text-zinc-400">
                        (aparece en badges de tareas)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={inviteForm.owner_label}
                      onChange={(e) => setInviteForm((f) => ({ ...f, owner_label: e.target.value }))}
                      placeholder={inviteForm.company_name.toUpperCase() || "CLIENTE"}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm uppercase outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-zinc-700">Rol</label>
                    <div className="flex gap-3">
                      {(["client", "admin"] as const).map((r) => (
                        <label
                          key={r}
                          className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                            inviteForm.role === r
                              ? "border-blue-500 bg-blue-50 text-blue-700"
                              : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name="invite-role"
                            value={r}
                            checked={inviteForm.role === r}
                            onChange={() => setInviteForm((f) => ({ ...f, role: r }))}
                            className="sr-only"
                          />
                          {r === "client" ? "👤 Cliente" : "🔑 Admin"}
                        </label>
                      ))}
                    </div>
                  </div>
                  {inviteError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✓ {inviteSuccess}</p>
                  )}
                  <div className="flex gap-3 pt-1">
                    <button
                      type="submit"
                      disabled={inviting}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {inviting
                        ? "Enviando..."
                        : inviteForm.role === "admin"
                        ? "Enviar invitación"
                        : "Siguiente →"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInvite(false)}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              {/* ── Step 2: Project template selection ── */}
              {inviteStep === 2 && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    Selecciona la plantilla de proyecto para{" "}
                    <strong>{inviteForm.company_name || inviteForm.full_name || "el cliente"}</strong>.
                  </p>

                  {loadingTemplates ? (
                    <div className="flex justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    </div>
                  ) : projectTemplates.length === 0 ? (
                    <p className="text-sm text-zinc-400">No hay plantillas de proyecto configuradas.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {projectTemplates.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedProjectTemplateId(t.id)}
                          className={`rounded-xl border-2 p-4 text-left transition-colors ${
                            selectedProjectTemplateId === t.id
                              ? "border-blue-500 bg-blue-50"
                              : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50"
                          }`}
                        >
                          <p className="text-sm font-semibold text-zinc-900">{t.name}</p>
                          {t.industry && (
                            <p className="mt-0.5 text-xs text-zinc-500">{t.industry}</p>
                          )}
                          {t.description && (
                            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">{t.description}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setInviteStep(1)}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      ← Atrás
                    </button>
                    <button
                      type="button"
                      onClick={handleStep2Next}
                      disabled={!selectedProjectTemplateId}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      Ver tareas →
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectTemplateId("");
                        handleInvite();
                      }}
                      disabled={inviting}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                    >
                      Omitir proyecto
                    </button>
                  </div>
                </div>
              )}

              {/* ── Step 3: Task preview & customization ── */}
              {inviteStep === 3 && (
                <div className="space-y-4">
                  <p className="text-sm text-zinc-600">
                    Selecciona las tareas que se incluirán en el proyecto.{" "}
                    <span className="text-zinc-400">
                      ({phaseTaskPreview.flatMap((p) => p.tasks).filter((t) => !excludedTaskIds.has(t.id)).length} seleccionadas)
                    </span>
                  </p>

                  {loadingPreview ? (
                    <div className="flex justify-center py-8">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    </div>
                  ) : (
                    <div className="max-h-64 space-y-3 overflow-auto rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                      {phaseTaskPreview.map((phase) => (
                        <div key={phase.id}>
                          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Fase {phase.phase_number} — {phase.name}
                          </p>
                          {phase.tasks.map((task) => {
                            const excluded = excludedTaskIds.has(task.id);
                            const tc = TASK_TYPE_COLORS[task.task_type] ?? TASK_TYPE_COLORS.hito;
                            return (
                              <label
                                key={task.id}
                                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white"
                              >
                                <input
                                  type="checkbox"
                                  checked={!excluded}
                                  onChange={() =>
                                    setExcludedTaskIds((prev) => {
                                      const next = new Set(prev);
                                      excluded ? next.delete(task.id) : next.add(task.id);
                                      return next;
                                    })
                                  }
                                  className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600"
                                />
                                <span className="flex-1 text-sm text-zinc-700">{task.name}</span>
                                <span
                                  style={{ background: tc.bg, color: tc.text }}
                                  className="rounded-full px-2 py-0.5 text-xs font-medium"
                                >
                                  {tc.label}
                                </span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    task.owner_type === "vambe"
                                      ? "bg-violet-100 text-violet-700"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {task.owner_type === "vambe" ? "Vambe" : "Cliente"}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  )}

                  {inviteError && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{inviteError}</p>
                  )}
                  {inviteSuccess && (
                    <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">✓ {inviteSuccess}</p>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setInviteStep(2)}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      ← Atrás
                    </button>
                    <button
                      type="button"
                      onClick={() => handleInvite()}
                      disabled={inviting || loadingPreview}
                      className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {inviting ? "Enviando..." : "Enviar invitación"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
