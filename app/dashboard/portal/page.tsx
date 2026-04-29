"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientPhase, ClientTask, PhaseFile, TaskValidation } from "@/lib/types";
import PortalHeader from "@/app/components/portal/PortalHeader";
import InfoRequestPanel from "@/app/components/portal/InfoRequestPanel";
import ValidationPanel from "@/app/components/portal/ValidationPanel";
import PhaseFiles from "@/app/components/portal/PhaseFiles";
import PortalHero from "@/app/components/portal/PortalHero";
import PhaseRail from "@/app/components/portal/PhaseRail";
import PandaTrack from "@/app/components/portal/PandaTrack";
import PhaseDetail from "@/app/components/portal/PhaseDetail";

interface PhaseWithTasks extends ClientPhase {
  tasks: (ClientTask & { validation?: TaskValidation })[];
  files: PhaseFile[];
}

// ── Progress helpers (unchanged from v1) ─────────────────────────

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

// ─────────────────────────────────────────────────────────────────

export default function PortalPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [phases, setPhases] = useState<PhaseWithTasks[]>([]);
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePhaseId, setActivePhaseId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<
    (ClientTask & { validation?: TaskValidation }) | null
  >(null);

  // PhaseRail → PandaTrack anchor positions
  const [phaseAnchors, setPhaseAnchors] = useState<number[]>([]);
  const railContainerRef = useRef<HTMLDivElement>(null);
  const [railHeight, setRailHeight] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role === "admin") router.replace("/dashboard/admin");
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && profile?.role !== "admin") load();
  }, [authLoading, user, profile]);

  // ── Data fetch (identical to v1) ────────────────────────────────

  const load = async () => {
    setLoading(true);
    try {
      const { data: membership } = await supabase
        .from("project_members")
        .select("project_id")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();

      const projectId = membership?.project_id ?? profile?.project_id;
      if (!projectId) {
        setHasProject(false);
        return;
      }

      const { data: project } = await supabase
        .from("client_projects")
        .select("*")
        .eq("id", projectId)
        .maybeSingle();

      if (!project) {
        setHasProject(false);
        return;
      }

      setHasProject(true);
      setProjectCreatedAt(project.created_at ?? null);

      const { data: phasesData } = await supabase
        .from("client_phases")
        .select("*")
        .eq("project_id", project.id)
        .order("phase_number");

      if (!phasesData || phasesData.length === 0) {
        setPhases([]);
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
      // Default active phase: first non-completed, or last
      const firstPending = assembled.find((p) => calcPhaseProgress(p.tasks) < 100);
      setActivePhaseId((firstPending ?? assembled[assembled.length - 1])?.id ?? null);
    } catch (err) {
      console.error("[portal] load error:", err);
      setHasProject(false);
    } finally {
      setLoading(false);
    }
  };

  // ── Layout helpers ───────────────────────────────────────────────

  const handleAnchorsChange = (anchors: number[]) => {
    setPhaseAnchors(anchors);
    if (railContainerRef.current) {
      setRailHeight(railContainerRef.current.offsetHeight);
    }
  };

  const handleTaskClick = (task: ClientTask & { validation?: TaskValidation }) => {
    setSelectedTask(task);
  };

  // ── Derived values ───────────────────────────────────────────────

  const totalProgress = calcTotalProgress(phases);
  const activePhase = phases.find((p) => p.id === activePhaseId) ?? null;

  const railPhases = phases.map((p) => ({
    id: p.id,
    phase_number: p.phase_number,
    name: p.name,
    progress: calcPhaseProgress(p.tasks),
  }));

  const trackPhases = phases.map((p) => ({
    id: p.id,
    progress: calcPhaseProgress(p.tasks),
  }));

  // CTA: next actionable client task in active phase, or "Ver Fase N+1"
  let continueLabel: string | null = null;
  let onContinueClick: (() => void) | null = null;

  if (activePhase) {
    const nextClientTask = activePhase.tasks
      .filter(
        (t) =>
          t.owner_type === "client" &&
          t.task_type !== "hito" &&
          t.status !== "completed"
      )
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];

    if (nextClientTask) {
      continueLabel = `Llena la siguiente: ${nextClientTask.name}`;
      onContinueClick = () => handleTaskClick(nextClientTask);
    } else {
      // All client tasks in phase done — offer to go to next phase
      const currentIdx = phases.findIndex((p) => p.id === activePhaseId);
      const nextPhase = phases[currentIdx + 1] ?? null;
      if (nextPhase) {
        continueLabel = `Ver Fase ${nextPhase.phase_number}: ${nextPhase.name}`;
        onContinueClick = () => setActivePhaseId(nextPhase.id);
      }
    }
  }

  // Build phase detail props
  const activePhaseProgress = activePhase ? calcPhaseProgress(activePhase.tasks) : 0;
  const completedTaskCount = activePhase?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const totalTaskCount = activePhase?.tasks.length ?? 0;

  // lastUpdated: most recent completed_at among active phase tasks
  const lastUpdated =
    activePhase?.tasks
      .map((t) => t.completed_at)
      .filter(Boolean)
      .sort()
      .reverse()[0] ?? null;

  // ── Loading / no-project states ──────────────────────────────────

  if (authLoading || !user) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: "12px",
          background: "var(--portal-bg-page)",
        }}
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p style={{ fontSize: "13px", color: "var(--portal-fg-5)" }}>Cargando...</p>
      </div>
    );
  }

  return (
    <>
      <PortalHeader
        companyName={profile?.company_name ?? null}
        totalProgress={totalProgress}
      />

      <main
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "0 32px",
          background: "var(--portal-bg-page)",
          minHeight: "calc(100vh - 68px)",
        }}
      >
        <PortalHero />

        {loading ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              paddingTop: "80px",
              gap: "12px",
            }}
          >
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p style={{ fontSize: "13px", color: "var(--portal-fg-5)" }}>
              Cargando proyecto...
            </p>
          </div>
        ) : !hasProject ? (
          <div
            style={{
              borderRadius: "16px",
              border: "1px solid var(--portal-line-1)",
              background: "white",
              padding: "48px 32px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "32px" }}>🚀</p>
            <p style={{ marginTop: "12px", fontSize: "15px", fontWeight: 600, color: "var(--portal-fg-1)" }}>
              Tu proyecto aún no ha sido configurado.
            </p>
            <p style={{ marginTop: "4px", fontSize: "13px", color: "var(--portal-fg-5)" }}>
              Contacta a tu administrador.
            </p>
          </div>
        ) : phases.length === 0 ? (
          <div
            style={{
              borderRadius: "16px",
              border: "1px solid var(--portal-line-1)",
              background: "white",
              padding: "48px 32px",
              textAlign: "center",
            }}
          >
            <p style={{ fontSize: "13px", color: "var(--portal-fg-5)" }}>
              No hay fases configuradas en tu proyecto.
            </p>
          </div>
        ) : (
          <div className="portal-layout">
            {/* Col 1: Phase Rail */}
            <div ref={railContainerRef}>
              <PhaseRail
                phases={railPhases}
                activePhaseId={activePhaseId ?? ""}
                onPhaseClick={setActivePhaseId}
                onAnchorsChange={handleAnchorsChange}
              />
            </div>

            {/* Col 2: Panda Track — hidden on mobile via grid collapse */}
            <div className="hidden min-[900px]:block">
              <PandaTrack
                phases={trackPhases}
                phaseAnchors={phaseAnchors}
                containerHeight={railHeight}
              />
            </div>

            {/* Col 3: Phase Detail */}
            {activePhase ? (
              <PhaseDetail
                phase={{
                  id: activePhase.id,
                  phase_number: activePhase.phase_number,
                  name: activePhase.name,
                  progress: activePhaseProgress,
                  totalPhases: phases.length,
                  completedTaskCount,
                  totalTaskCount,
                  lastUpdated,
                }}
                company={profile?.company_name ?? null}
                projectCreatedAt={projectCreatedAt}
                vambeTasks={activePhase.tasks.filter((t) => t.owner_type === "vambe")}
                clientTasks={activePhase.tasks.filter((t) => t.owner_type === "client")}
                onTaskClick={handleTaskClick}
                onPhaseFilesRender={() => (
                  <PhaseFiles
                    phaseId={activePhase.id}
                    clientId={user.id}
                    initialFiles={activePhase.files}
                  />
                )}
                onContinueClick={onContinueClick}
                continueLabel={continueLabel}
              />
            ) : null}
          </div>
        )}
      </main>

      {/* Panels — unchanged from v1 */}
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
        />
      )}
    </>
  );
}
