"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientPhase, ClientTask, PhaseFile, ProjectTemplate, TaskValidation } from "@/lib/types";
import { createProjectFromTemplate } from "@/lib/createProject";
import PortalProviders from "@/app/components/portal/PortalProviders";
import PortalHeader from "@/app/components/portal/PortalHeader";
import PhaseSidebar from "@/app/components/portal/PhaseSidebar";
import PhaseCard from "@/app/components/portal/PhaseCard";
import InfoRequestPanel from "@/app/components/portal/InfoRequestPanel";
import ValidationPanel from "@/app/components/portal/ValidationPanel";
import AddTaskModal, { type AddTaskData } from "@/app/components/portal/AddTaskModal";
import ExportModal from "@/app/components/portal/ExportModal";

interface PhaseWithTasks extends ClientPhase {
  tasks: (ClientTask & { validation?: TaskValidation })[];
  files: PhaseFile[];
}

interface ClientProfile {
  full_name: string | null;
  company_name: string | null;
}

function calcPhaseProgress(tasks: ClientTask[]): number {
  if (tasks.length === 0) return 0;
  const sum = tasks.reduce((acc, t) => {
    if (t.status === "completed") return acc + 100;
    if (t.status === "in_progress") return acc + Number(t.progress ?? 0);
    return acc;
  }, 0);
  return sum / tasks.length;
}

function calcTotalProgress(phases: PhaseWithTasks[]): number {
  const allTasks = phases.flatMap((p) => p.tasks);
  if (allTasks.length === 0) return 0;
  const sum = allTasks.reduce((acc, t) => {
    if (t.status === "completed") return acc + 100;
    if (t.status === "in_progress") return acc + Number(t.progress ?? 0);
    return acc;
  }, 0);
  return sum / allTasks.length;
}

export default function AdminClientDetailPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const phaseRefs = useRef<Map<string, HTMLElement>>(new Map());
  const settingsMenuRef = useRef<HTMLDivElement>(null);

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [phases, setPhases] = useState<PhaseWithTasks[]>([]);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<(ClientTask & { validation?: TaskValidation }) | null>(null);
  const [addTaskPhaseId, setAddTaskPhaseId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);

  // Delete client state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingClient, setDeletingClient] = useState(false);
  const [deleteClientError, setDeleteClientError] = useState<string | null>(null);

  // Current project id (set after load — supports member users whose project is looked up via project_members)
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Members modal state
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [members, setMembers] = useState<Array<{
    user_id: string;
    role: string;
    created_at: string;
    full_name: string | null;
    company_name: string | null;
  }>>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [addMemberSuccess, setAddMemberSuccess] = useState<string | null>(null);

  // Recrear proyecto state
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [recreateStep, setRecreateStep] = useState<null | "warning" | "select">(null);
  const [recreateStats, setRecreateStats] = useState<{ responses: number; files: number } | null>(null);
  const [allTemplates, setAllTemplates] = useState<ProjectTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [templatePreview, setTemplatePreview] = useState<{ phases: number; tasks: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [recreating, setRecreating] = useState(false);
  const [recreateError, setRecreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!showSettingsMenu) return;
    const handler = (e: MouseEvent) => {
      if (settingsMenuRef.current && !settingsMenuRef.current.contains(e.target as Node)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSettingsMenu]);

  const loadClientProfile = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, company_name")
      .eq("id", clientId)
      .single();
    if (data) setClientProfile(data);
  }, [clientId]);

  const load = useCallback(async () => {
    setLoading(true);

    // Check project_members first (for member users who don't own the project via client_id)
    const { data: membership } = await supabase
      .from("project_members")
      .select("project_id")
      .eq("user_id", clientId)
      .limit(1)
      .maybeSingle();

    const { data: project } = membership?.project_id
      ? await supabase.from("client_projects").select("*").eq("id", membership.project_id).maybeSingle()
      : await supabase.from("client_projects").select("*").eq("client_id", clientId).maybeSingle();

    if (!project) {
      setHasProject(false);
      setCurrentProjectId(null);
      setLoading(false);
      return;
    }

    setHasProject(true);
    setCurrentProjectId(project.id);

    const { data: phasesData } = await supabase
      .from("client_phases")
      .select("*")
      .eq("project_id", project.id)
      .order("phase_number");

    if (!phasesData || phasesData.length === 0) {
      setPhases([]);
      setLoading(false);
      return;
    }

    const phaseIds = phasesData.map((p) => p.id);

    const { data: tasksData } = await supabase
      .from("client_tasks")
      .select("*")
      .in("phase_id", phaseIds)
      .order("sort_order");

    const tasks = tasksData ?? [];
    const taskIds = tasks.map((t) => t.id);

    let validationMap = new Map<string, TaskValidation>();
    if (taskIds.length > 0) {
      const { data: validationsData } = await supabase
        .from("task_validations")
        .select("*")
        .in("task_id", taskIds);
      validationMap = new Map(
        (validationsData ?? []).map((v) => [v.task_id, v])
      );
    }

    const { data: phaseFilesData } = await supabase
      .from("phase_files")
      .select("*")
      .in("phase_id", phaseIds);

    const phaseFilesMap = new Map<string, PhaseFile[]>();
    for (const f of phaseFilesData ?? []) {
      if (!phaseFilesMap.has(f.phase_id)) phaseFilesMap.set(f.phase_id, []);
      phaseFilesMap.get(f.phase_id)!.push(f as PhaseFile);
    }

    const assembled: PhaseWithTasks[] = phasesData.map((phase) => ({
      ...phase,
      files: phaseFilesMap.get(phase.id) ?? [],
      tasks: tasks
        .filter((t) => t.phase_id === phase.id)
        .map((t) => ({ ...t, validation: validationMap.get(t.id) })),
    }));

    setPhases(assembled);
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin" && clientId) {
      loadClientProfile();
      load();
    }
  }, [authLoading, profile, clientId, loadClientProfile, load]);

  const handleCheckboxClick = async (task: ClientTask) => {
    if (task.status === "completed") {
      await supabase
        .from("client_tasks")
        .update({ progress: 0, status: "pending", completed_at: null, completed_by: null })
        .eq("id", task.id);
    } else {
      await supabase
        .from("client_tasks")
        .update({
          progress: 100,
          status: "completed",
          completed_at: new Date().toISOString(),
          completed_by: "admin",
        })
        .eq("id", task.id);
    }
    await load();
  };

  const handleDueDateChange = async (taskId: string, date: string) => {
    await supabase
      .from("client_tasks")
      .update({ due_date: date || null })
      .eq("id", taskId);
    await load();
  };

  const handleOwnerLabelChange = async (taskId: string, label: string) => {
    await supabase
      .from("client_tasks")
      .update({ owner_label: label })
      .eq("id", taskId);
    await load();
  };

  const handleNameChange = async (taskId: string, name: string) => {
    await supabase
      .from("client_tasks")
      .update({ name })
      .eq("id", taskId);
    await load();
  };

  const handleDeleteTask = async (taskId: string) => {
    // Cascade: task_files (storage + db) → task_responses → task_questions → task_validations → client_tasks
    const { data: questions } = await supabase
      .from("task_questions")
      .select("id")
      .eq("task_id", taskId);

    if (questions && questions.length > 0) {
      const qIds = questions.map((q) => q.id);

      // Remove storage files
      const { data: filesToDelete } = await supabase
        .from("task_files")
        .select("file_path")
        .in("question_id", qIds);
      if (filesToDelete && filesToDelete.length > 0) {
        await supabase.storage
          .from("submissions")
          .remove(filesToDelete.map((f) => f.file_path));
      }

      await supabase.from("task_files").delete().in("question_id", qIds);
      await supabase.from("task_responses").delete().in("question_id", qIds);
      await supabase.from("task_questions").delete().eq("task_id", taskId);
    }

    await supabase.from("task_validations").delete().eq("task_id", taskId);
    await supabase.from("client_tasks").delete().eq("id", taskId);
    await load();
  };

  const handlePhaseNameChange = async (phaseId: string, name: string) => {
    await supabase
      .from("client_phases")
      .update({ name })
      .eq("id", phaseId);
    await load();
  };

  const handleOwnerTypeChange = async (taskId: string, ownerType: "client" | "vambe", label: string) => {
    await supabase
      .from("client_tasks")
      .update({ owner_type: ownerType, owner_label: label })
      .eq("id", taskId);
    await load();
  };

  const handleDeleteClient = async () => {
    setDeletingClient(true);
    setDeleteClientError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/delete-client", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ clientId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error al eliminar");
      router.replace("/dashboard/admin");
    } catch (err) {
      setDeleteClientError(err instanceof Error ? err.message : "Error al eliminar");
      setDeletingClient(false);
    }
  };

  const loadMembers = useCallback(async () => {
    if (!currentProjectId) return;
    setMembersLoading(true);
    const { data } = await supabase
      .from("project_members")
      .select("user_id, role, created_at, profiles(full_name, company_name)")
      .eq("project_id", currentProjectId)
      .order("created_at");
    setMembers(
      (data ?? []).map((m: any) => ({
        user_id: m.user_id,
        role: m.role,
        created_at: m.created_at,
        full_name: (m.profiles as any)?.full_name ?? null,
        company_name: (m.profiles as any)?.company_name ?? null,
      }))
    );
    setMembersLoading(false);
  }, [currentProjectId]);

  const handleAddMember = async () => {
    if (!addMemberEmail.trim() || !currentProjectId) return;
    setAddMemberLoading(true);
    setAddMemberError(null);
    setAddMemberSuccess(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";
      const res = await fetch("/api/admin/lookup-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: addMemberEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Usuario no encontrado");
      const { userId, fullName } = json;
      const { error } = await supabase
        .from("project_members")
        .upsert(
          { project_id: currentProjectId, user_id: userId, role: "member" },
          { onConflict: "project_id,user_id" }
        );
      if (error) throw new Error(error.message);
      setAddMemberEmail("");
      setAddMemberSuccess(`${fullName ?? addMemberEmail.trim()} agregado al proyecto`);
      await loadMembers();
    } catch (err) {
      setAddMemberError(err instanceof Error ? err.message : "Error al agregar miembro");
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!currentProjectId) return;
    await supabase
      .from("project_members")
      .delete()
      .eq("project_id", currentProjectId)
      .eq("user_id", userId);
    await loadMembers();
  };

  const handleOpenRecreate = async () => {
    setShowSettingsMenu(false);
    // Count client data: responses + files linked to this client's project
    const project = currentProjectId ? { id: currentProjectId } : null;

    if (!project) {
      setRecreateStats({ responses: 0, files: 0 });
      setRecreateStep("warning");
      return;
    }

    const { data: phasesData } = await supabase
      .from("client_phases")
      .select("id")
      .eq("project_id", project.id);

    const phaseIds = (phasesData ?? []).map((p) => p.id);
    let taskIds: string[] = [];
    if (phaseIds.length > 0) {
      const { data: tasksData } = await supabase
        .from("client_tasks")
        .select("id")
        .in("phase_id", phaseIds);
      taskIds = (tasksData ?? []).map((t) => t.id);
    }

    let questionIds: string[] = [];
    if (taskIds.length > 0) {
      const { data: questionsData } = await supabase
        .from("task_questions")
        .select("id")
        .in("task_id", taskIds);
      questionIds = (questionsData ?? []).map((q) => q.id);
    }

    let responseCount = 0;
    let fileCount = 0;
    if (questionIds.length > 0) {
      const [{ count: rc }, { count: fc }] = await Promise.all([
        supabase.from("task_responses").select("id", { count: "exact", head: true }).in("question_id", questionIds),
        supabase.from("task_files").select("id", { count: "exact", head: true }).in("question_id", questionIds),
      ]);
      responseCount = rc ?? 0;
      fileCount = fc ?? 0;
    }

    setRecreateStats({ responses: responseCount, files: fileCount });
    setRecreateStep("warning");
  };

  const handleProceedToTemplateSelect = async () => {
    const { data } = await supabase
      .from("project_templates")
      .select("*")
      .order("name");
    setAllTemplates(data ?? []);
    setSelectedTemplateId(null);
    setTemplatePreview(null);
    setRecreateStep("select");
  };

  const handleSelectTemplatePreview = async (templateId: string) => {
    setSelectedTemplateId(templateId);
    setLoadingPreview(true);
    setTemplatePreview(null);

    const { data: pts } = await supabase
      .from("phase_templates")
      .select("id")
      .eq("template_id", templateId);

    const phaseCount = (pts ?? []).length;
    let taskCount = 0;
    if (phaseCount > 0) {
      const ptIds = (pts ?? []).map((p) => p.id);
      const { count } = await supabase
        .from("task_templates")
        .select("id", { count: "exact", head: true })
        .in("phase_template_id", ptIds);
      taskCount = count ?? 0;
    }

    setTemplatePreview({ phases: phaseCount, tasks: taskCount });
    setLoadingPreview(false);
  };

  const handleRecreateConfirm = async () => {
    if (!selectedTemplateId) return;
    setRecreating(true);
    setRecreateError(null);

    try {
      // 1. Use current project from state
      const project = currentProjectId ? { id: currentProjectId } : null;

      if (project) {
        // 2. Cascade delete: storage → task_files → task_responses → task_questions → task_validations → client_tasks → phase_files → client_phases → client_projects
        const { data: phasesData } = await supabase
          .from("client_phases")
          .select("id")
          .eq("project_id", project.id);

        const phaseIds = (phasesData ?? []).map((p) => p.id);

        if (phaseIds.length > 0) {
          const { data: tasksData } = await supabase
            .from("client_tasks")
            .select("id")
            .in("phase_id", phaseIds);
          const taskIds = (tasksData ?? []).map((t) => t.id);

          if (taskIds.length > 0) {
            const { data: questionsData } = await supabase
              .from("task_questions")
              .select("id")
              .in("task_id", taskIds);
            const questionIds = (questionsData ?? []).map((q) => q.id);

            if (questionIds.length > 0) {
              const { data: filesToDelete } = await supabase
                .from("task_files")
                .select("file_path")
                .in("question_id", questionIds);
              if (filesToDelete && filesToDelete.length > 0) {
                await supabase.storage
                  .from("submissions")
                  .remove(filesToDelete.map((f) => f.file_path));
              }
              await supabase.from("task_files").delete().in("question_id", questionIds);
              await supabase.from("task_responses").delete().in("question_id", questionIds);
              await supabase.from("task_questions").delete().in("task_id", taskIds);
            }

            await supabase.from("task_validations").delete().in("task_id", taskIds);
            await supabase.from("client_tasks").delete().in("phase_id", phaseIds);
          }

          // Delete phase files from storage + db
          const { data: phaseFilesToDelete } = await supabase
            .from("phase_files")
            .select("file_path")
            .in("phase_id", phaseIds);
          if (phaseFilesToDelete && phaseFilesToDelete.length > 0) {
            await supabase.storage
              .from("submissions")
              .remove(phaseFilesToDelete.map((f) => f.file_path));
          }
          await supabase.from("phase_files").delete().in("phase_id", phaseIds);
          await supabase.from("client_phases").delete().eq("project_id", project.id);
        }

        await supabase.from("client_projects").delete().eq("id", project.id);
        await supabase.from("profiles").update({ project_id: null }).eq("id", clientId);
      }

      // 3. Create new project from selected template
      const ownerLabel = (clientProfile?.company_name ?? "CLIENTE").toUpperCase();
      const companyName = clientProfile?.company_name ?? "Cliente";
      await createProjectFromTemplate(clientId, selectedTemplateId, ownerLabel, companyName);

      setRecreateStep(null);
      setRecreateStats(null);
      setSelectedTemplateId(null);
      setTemplatePreview(null);
      await load();
    } catch (err) {
      console.error("Error recreating project:", err);
      setRecreateError("Ocurrió un error. El proyecto puede estar en un estado inconsistente. Contacta soporte.");
    } finally {
      setRecreating(false);
    }
  };

  const getPhaseMaxSortOrder = (phaseId: string): number => {
    const phase = phases.find((p) => p.id === phaseId);
    if (!phase || phase.tasks.length === 0) return 0;
    return Math.max(...phase.tasks.map((t) => t.sort_order ?? 0));
  };

  const handleAddTask = async (data: AddTaskData) => {
    const { data: task, error: taskError } = await supabase
      .from("client_tasks")
      .insert({
        phase_id: data.phaseId,
        name: data.name,
        task_type: data.task_type,
        owner_type: data.owner_type,
        owner_label: data.owner_label,
        due_date: data.due_date || null,
        description: data.description || null,
        sort_order: data.sort_order,
        status: "pending",
        progress: 0,
      })
      .select()
      .single();

    if (taskError || !task) throw new Error(taskError?.message ?? "Failed to create task");

    if (data.task_type === "validation") {
      await supabase.from("task_validations").insert({
        task_id: task.id,
        doc_url: data.doc_url || null,
        doc_title: data.doc_title || null,
      });
    }

    if (data.task_type === "info_request" && data.questions.length > 0) {
      await supabase.from("task_questions").insert(
        data.questions.map((q, i) => ({
          task_id: task.id,
          question_text: q.question_text,
          placeholder: q.placeholder || null,
          sort_order: i,
        }))
      );
    }

    await load();
  };

  const handlePhaseClick = (phaseId: string) => {
    const el = phaseRefs.current.get(phaseId);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (authLoading || !user) return null;

  const totalProgress = calcTotalProgress(phases);
  const sidebarPhases = phases.map((p) => ({
    id: p.id,
    phase_number: p.phase_number,
    name: p.name,
    progress: calcPhaseProgress(p.tasks),
  }));

  return (
    <PortalProviders>
      {/* Back link bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "10px 24px",
          borderBottom: "1px solid #E2E8F0",
          background: "white",
        }}
      >
        <Link
          href="/dashboard/admin"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "13px",
            fontWeight: 500,
            color: "#64748B",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "#0F1629")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = "#64748B")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 2L3 7L9 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Volver a clientes
        </Link>
        {clientProfile?.full_name && (
          <>
            <span style={{ color: "#E2E8F0", fontSize: "14px" }}>/</span>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#0F1629" }}>
              {clientProfile.full_name}
            </span>
          </>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          )}
          {!loading && hasProject && phases.length > 0 && (
            <button
              onClick={() => setShowExport(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1.5px solid #0F1629",
                background: "white",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                color: "#0F1629",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#F8FAFC")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "white")}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Exportar
            </button>
          )}
          {/* Members button */}
          {!loading && hasProject && (
            <button
              onClick={() => {
                loadMembers();
                setShowMembersModal(true);
                setAddMemberEmail("");
                setAddMemberError(null);
                setAddMemberSuccess(null);
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 14px",
                borderRadius: "8px",
                border: "1.5px solid #E2E8F0",
                background: "white",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 600,
                color: "#64748B",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#F8FAFC")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "white")}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="5" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
                <path d="M1 12c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M11 5v4M9 7h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              Miembros
            </button>
          )}
          {/* Settings menu — only shown when client has an active project */}
          {!loading && hasProject && (
            <div ref={settingsMenuRef} style={{ position: "relative" }}>
              <button
                onClick={() => setShowSettingsMenu((v) => !v)}
                title="Acciones del proyecto"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  border: "1.5px solid #E2E8F0",
                  background: showSettingsMenu ? "#F1F5F9" : "white",
                  cursor: "pointer",
                  color: "#64748B",
                  transition: "background 0.15s, border-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "#F8FAFC";
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#CBD5E1";
                }}
                onMouseLeave={(e) => {
                  if (!showSettingsMenu) {
                    (e.currentTarget as HTMLButtonElement).style.background = "white";
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0";
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="2.5" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="7" r="1.2" fill="currentColor" />
                  <circle cx="7" cy="11.5" r="1.2" fill="currentColor" />
                </svg>
              </button>
              {showSettingsMenu && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    zIndex: 200,
                    background: "white",
                    borderRadius: "10px",
                    border: "1px solid #E2E8F0",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                    minWidth: "220px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={handleOpenRecreate}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#DC2626",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                  >
                    Recrear proyecto con otro template
                  </button>
                  <div style={{ height: "1px", background: "#F1F5F9", margin: "0 12px" }} />
                  <button
                    onClick={() => { setShowSettingsMenu(false); setShowDeleteConfirm(true); }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 16px",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "#DC2626",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "#FEF2F2")}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = "none")}
                  >
                    Eliminar cliente
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Portal header with client company */}
      <PortalHeader
        companyName={clientProfile?.company_name ?? null}
        totalProgress={totalProgress}
      />

      <div style={{ display: "flex", background: "#F5F7FB", minHeight: "calc(100vh - 108px)" }}>
        {/* Phase sidebar — offset right of admin sidebar (240px) and below admin+portal headers (116px) */}
        {!loading && hasProject && phases.length > 0 && (
          <PhaseSidebar
            phases={sidebarPhases}
            onPhaseClick={handlePhaseClick}
            leftOffset={240}
            topOffset={116}
          />
        )}

        {/* Main content */}
        <main
          className="flex-1 min-[900px]:ml-[180px]"
          style={{ padding: "24px 32px" }}
        >
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: "64px" }}>
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : !hasProject ? (
            <div
              style={{
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                background: "white",
                padding: "48px 32px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "32px" }}>📋</p>
              <p style={{ marginTop: "12px", fontSize: "15px", fontWeight: 600, color: "#0F1629" }}>
                Este cliente no tiene proyecto asignado
              </p>
              <p style={{ marginTop: "4px", fontSize: "13px", color: "#94A3B8" }}>
                Invita de nuevo al cliente con un proyecto para usar el Portal de Status.
              </p>
            </div>
          ) : phases.length === 0 ? (
            <div
              style={{
                borderRadius: "16px",
                border: "1px solid #E2E8F0",
                background: "white",
                padding: "48px 32px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "13px", color: "#94A3B8" }}>
                No hay fases configuradas en el proyecto de este cliente.
              </p>
            </div>
          ) : (
            <>
              {/* Admin info banner */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "8px 14px",
                  marginBottom: "16px",
                  background: "#EEF2FF",
                  borderRadius: "8px",
                  border: "1px solid #C7D2FE",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <circle cx="7" cy="7" r="6" stroke="#4F46E5" strokeWidth="1.3" />
                  <path d="M7 6v4M7 4.5v.5" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: "12px", color: "#4F46E5", fontWeight: 500 }}>
                  Vista de administrador — edita nombres, fechas, propietarios, fases y preguntas. Haz clic en cualquier texto para editarlo.
                </span>
              </div>

              {/* Phase cards */}
              {phases.map((phase, i) => {
                const phaseProgress = calcPhaseProgress(phase.tasks);
                return (
                  <div
                    key={phase.id}
                    ref={(el) => { if (el) phaseRefs.current.set(phase.id, el); }}
                    style={{ scrollMarginTop: "120px" }}
                  >
                    <PhaseCard
                      phase={phase}
                      tasks={phase.tasks}
                      defaultOpen={i === 0}
                      progress={phaseProgress}
                      onTaskClick={(task) =>
                        setSelectedTask(task as ClientTask & { validation?: TaskValidation })
                      }
                      isAdmin={true}
                      onCheckboxClick={handleCheckboxClick}
                      onAddTask={(phaseId) => setAddTaskPhaseId(phaseId)}
                      onDueDateChange={handleDueDateChange}
                      onOwnerLabelChange={handleOwnerLabelChange}
                      onNameChange={handleNameChange}
                      onDeleteTask={handleDeleteTask}
                      onOwnerTypeChange={handleOwnerTypeChange}
                      onPhaseNameChange={handlePhaseNameChange}
                      phaseFiles={phase.files}
                      clientId={clientId}
                    />
                  </div>
                );
              })}
            </>
          )}
        </main>
      </div>

      {/* Panels */}
      {selectedTask?.task_type === "info_request" && (
        <InfoRequestPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={load}
          isAdmin={true}
          clientId={clientId}
        />
      )}
      {selectedTask?.task_type === "validation" && (
        <ValidationPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={load}
          isAdmin={true}
        />
      )}

      {/* Add task modal */}
      {addTaskPhaseId && (
        <AddTaskModal
          phaseId={addTaskPhaseId}
          defaultOwnerLabel={clientProfile?.company_name?.toUpperCase() ?? "CLIENTE"}
          maxSortOrder={getPhaseMaxSortOrder(addTaskPhaseId)}
          onClose={() => setAddTaskPhaseId(null)}
          onAdd={handleAddTask}
        />
      )}

      {/* Export modal */}
      {showExport && (
        <ExportModal
          clientId={clientId}
          companyName={clientProfile?.company_name ?? null}
          phases={phases}
          onClose={() => setShowExport(false)}
        />
      )}

      {/* Recrear proyecto — Step 1: Warning */}
      {recreateStep === "warning" && recreateStats && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,22,41,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setRecreateStep(null); }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "32px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#FEF2F2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 3L18 17H2L10 3Z" stroke="#DC2626" strokeWidth="1.6" strokeLinejoin="round" />
                <path d="M10 9v4M10 14.5v.5" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </div>
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F1629", marginBottom: "8px" }}>
              Recrear proyecto
            </h2>
            <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "16px", lineHeight: 1.6 }}>
              Esta acción eliminará permanentemente todo el progreso del cliente:
            </p>
            <div
              style={{
                background: "#FEF2F2",
                borderRadius: "10px",
                padding: "12px 16px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#991B1B",
                lineHeight: 1.8,
              }}
            >
              <div>Respuestas guardadas: <strong>{recreateStats.responses}</strong></div>
              <div>Archivos subidos: <strong>{recreateStats.files}</strong></div>
              <div style={{ marginTop: "6px", color: "#DC2626", fontWeight: 600 }}>
                Esta acción no se puede deshacer.
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setRecreateStep(null)}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "1.5px solid #E2E8F0",
                  background: "white",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#64748B",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleProceedToTemplateSelect}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#DC2626",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "white",
                }}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recrear proyecto — Step 2: Template selector */}
      {recreateStep === "select" && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,22,41,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !recreating) { setRecreateStep(null); setRecreateError(null); } }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "32px",
              width: "100%",
              maxWidth: "460px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h2 style={{ fontSize: "17px", fontWeight: 700, color: "#0F1629", marginBottom: "6px" }}>
              Seleccionar template
            </h2>
            <p style={{ fontSize: "13px", color: "#64748B", marginBottom: "20px" }}>
              El proyecto del cliente se recreará desde cero usando el template seleccionado.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "20px", maxHeight: "260px", overflowY: "auto" }}>
              {allTemplates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleSelectTemplatePreview(tpl.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    padding: "12px 14px",
                    borderRadius: "10px",
                    border: selectedTemplateId === tpl.id ? "2px solid #3B82F6" : "1.5px solid #E2E8F0",
                    background: selectedTemplateId === tpl.id ? "#EFF6FF" : "white",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 0.15s, background 0.15s",
                  }}
                >
                  <div
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      flexShrink: 0,
                      background: selectedTemplateId === tpl.id ? "#3B82F6" : "#CBD5E1",
                      transition: "background 0.15s",
                    }}
                  />
                  <div>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F1629" }}>{tpl.name}</div>
                    {tpl.industry && (
                      <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px" }}>{tpl.industry}</div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Template preview */}
            {selectedTemplateId && (
              <div
                style={{
                  background: "#F8FAFC",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  marginBottom: "20px",
                  fontSize: "13px",
                  color: "#475569",
                  minHeight: "44px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                }}
              >
                {loadingPreview ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                ) : templatePreview ? (
                  <>
                    <span><strong>{templatePreview.phases}</strong> fases</span>
                    <span style={{ color: "#CBD5E1" }}>·</span>
                    <span><strong>{templatePreview.tasks}</strong> tareas</span>
                  </>
                ) : null}
              </div>
            )}

            {recreateError && (
              <div
                style={{
                  marginBottom: "16px",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  fontSize: "12px",
                  color: "#DC2626",
                  lineHeight: 1.5,
                }}
              >
                {recreateError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => { if (!recreating) { setRecreateStep("warning"); setSelectedTemplateId(null); setTemplatePreview(null); setRecreateError(null); } }}
                disabled={recreating}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "1.5px solid #E2E8F0",
                  background: "white",
                  cursor: recreating ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#64748B",
                  opacity: recreating ? 0.5 : 1,
                }}
              >
                Volver
              </button>
              <button
                onClick={handleRecreateConfirm}
                disabled={!selectedTemplateId || recreating}
                style={{
                  padding: "8px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background: selectedTemplateId && !recreating ? "#DC2626" : "#E2E8F0",
                  cursor: selectedTemplateId && !recreating ? "pointer" : "not-allowed",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: selectedTemplateId && !recreating ? "white" : "#94A3B8",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  transition: "background 0.15s",
                }}
              >
                {recreating && (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {recreating ? "Recreando..." : "Recrear proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Delete Client Confirmation Modal ─────────────────── */}
      {showDeleteConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,22,41,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget && !deletingClient) setShowDeleteConfirm(false); }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "32px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "50%",
                background: "#FEF2F2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M9 2h2a1 1 0 0 1 1 1v1H8V3a1 1 0 0 1 1-1ZM5 5h10l-1 12H6L5 5Zm3 2v8m4-8v8" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0F1629", marginBottom: "8px" }}>
              Eliminar cliente
            </h3>
            <p style={{ fontSize: "14px", color: "#64748B", lineHeight: 1.5, marginBottom: "8px" }}>
              ¿Estás seguro de que quieres eliminar permanentemente a{" "}
              <strong style={{ color: "#0F1629" }}>
                {clientProfile?.company_name ?? clientProfile?.full_name ?? "este cliente"}
              </strong>
              ?
            </p>
            <p style={{ fontSize: "13px", color: "#EF4444", marginBottom: "24px" }}>
              Se borrarán todos sus proyectos, tareas, respuestas, archivos y su cuenta de acceso. Esta acción no se puede deshacer.
            </p>
            {deleteClientError && (
              <div style={{ padding: "10px 14px", borderRadius: "8px", background: "#FEF2F2", border: "1px solid #FECACA", color: "#DC2626", fontSize: "13px", marginBottom: "16px" }}>
                {deleteClientError}
              </div>
            )}
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteClientError(null); }}
                disabled={deletingClient}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1.5px solid #E2E8F0",
                  background: "white",
                  cursor: deletingClient ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "#64748B",
                  opacity: deletingClient ? 0.5 : 1,
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteClient}
                disabled={deletingClient}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "none",
                  background: deletingClient ? "#E2E8F0" : "#DC2626",
                  cursor: deletingClient ? "not-allowed" : "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: deletingClient ? "#94A3B8" : "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {deletingClient && (
                  <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {deletingClient ? "Eliminando..." : "Eliminar permanentemente"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Members Modal ─────────────────────────────────────── */}
      {showMembersModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(15,22,41,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowMembersModal(false); }}
        >
          <div
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "32px",
              width: "100%",
              maxWidth: "480px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "17px", fontWeight: 700, color: "#0F1629" }}>Miembros del proyecto</h3>
              <button
                onClick={() => setShowMembersModal(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: "20px", lineHeight: 1, padding: "2px 6px" }}
              >
                ×
              </button>
            </div>

            {/* Member list */}
            <div style={{ flex: 1, overflowY: "auto", marginBottom: "20px", minHeight: "60px" }}>
              {membersLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                </div>
              ) : members.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#94A3B8", textAlign: "center", padding: "24px 0" }}>
                  No hay miembros registrados.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {members.map((m) => (
                    <div
                      key={m.user_id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "10px 14px",
                        borderRadius: "10px",
                        border: "1px solid #E2E8F0",
                        background: "#FAFAFA",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "13px", fontWeight: 600, color: "#0F1629" }}>
                          {m.full_name ?? "Sin nombre"}
                        </div>
                        {m.company_name && (
                          <div style={{ fontSize: "11px", color: "#94A3B8", marginTop: "1px" }}>
                            {m.company_name}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "20px",
                          background: m.role === "owner" ? "#EFF6FF" : "#F1F5F9",
                          color: m.role === "owner" ? "#2563EB" : "#64748B",
                          flexShrink: 0,
                        }}
                      >
                        {m.role === "owner" ? "Propietario" : "Miembro"}
                      </span>
                      {m.role !== "owner" && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id)}
                          title="Eliminar miembro"
                          style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#CBD5E1",
                            padding: "2px",
                            display: "flex",
                            alignItems: "center",
                            flexShrink: 0,
                            transition: "color 0.12s",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#DC2626")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1")}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add member form */}
            <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: "16px" }}>
              <p style={{ fontSize: "12px", fontWeight: 600, color: "#64748B", marginBottom: "8px" }}>
                Agregar miembro existente
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <input
                  type="email"
                  placeholder="email@ejemplo.com"
                  value={addMemberEmail}
                  onChange={(e) => {
                    setAddMemberEmail(e.target.value);
                    setAddMemberError(null);
                    setAddMemberSuccess(null);
                  }}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddMember(); }}
                  style={{
                    flex: 1,
                    padding: "8px 12px",
                    borderRadius: "8px",
                    border: "1.5px solid #E2E8F0",
                    fontSize: "13px",
                    color: "#0F1629",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleAddMember}
                  disabled={addMemberLoading || !addMemberEmail.trim()}
                  style={{
                    padding: "8px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: addMemberEmail.trim() && !addMemberLoading ? "#0F1629" : "#E2E8F0",
                    color: addMemberEmail.trim() && !addMemberLoading ? "white" : "#94A3B8",
                    cursor: addMemberEmail.trim() && !addMemberLoading ? "pointer" : "not-allowed",
                    fontSize: "13px",
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    flexShrink: 0,
                  }}
                >
                  {addMemberLoading && (
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                  Agregar
                </button>
              </div>
              {addMemberError && (
                <p style={{ fontSize: "12px", color: "#DC2626", marginTop: "6px" }}>{addMemberError}</p>
              )}
              {addMemberSuccess && (
                <p style={{ fontSize: "12px", color: "#059669", marginTop: "6px" }}>{addMemberSuccess}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </PortalProviders>
  );
}
