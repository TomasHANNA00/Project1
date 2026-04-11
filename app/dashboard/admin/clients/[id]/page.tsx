"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientPhase, ClientTask, TaskValidation } from "@/lib/types";
import PortalProviders from "@/app/components/portal/PortalProviders";
import PortalHeader from "@/app/components/portal/PortalHeader";
import PhaseSidebar from "@/app/components/portal/PhaseSidebar";
import PhaseCard from "@/app/components/portal/PhaseCard";
import InfoRequestPanel from "@/app/components/portal/InfoRequestPanel";
import ValidationPanel from "@/app/components/portal/ValidationPanel";
import AddTaskModal, { type AddTaskData } from "@/app/components/portal/AddTaskModal";

interface PhaseWithTasks extends ClientPhase {
  tasks: (ClientTask & { validation?: TaskValidation })[];
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

  const [clientProfile, setClientProfile] = useState<ClientProfile | null>(null);
  const [phases, setPhases] = useState<PhaseWithTasks[]>([]);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<(ClientTask & { validation?: TaskValidation }) | null>(null);
  const [addTaskPhaseId, setAddTaskPhaseId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

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

    const { data: project } = await supabase
      .from("client_projects")
      .select("*")
      .eq("client_id", clientId)
      .maybeSingle();

    if (!project) {
      setHasProject(false);
      setLoading(false);
      return;
    }

    setHasProject(true);

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

    const assembled: PhaseWithTasks[] = phasesData.map((phase) => ({
      ...phase,
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
        {loading && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent ml-auto" />
        )}
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
                  Vista de administrador — puedes marcar tareas, editar fechas y etiquetas, y agregar tareas nuevas.
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
    </PortalProviders>
  );
}
