"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientPhase, ClientTask, TaskValidation } from "@/lib/types";
import PortalHeader from "@/app/components/portal/PortalHeader";
import PhaseSidebar from "@/app/components/portal/PhaseSidebar";
import PhaseCard from "@/app/components/portal/PhaseCard";
import InfoRequestPanel from "@/app/components/portal/InfoRequestPanel";
import ValidationPanel from "@/app/components/portal/ValidationPanel";

interface PhaseWithTasks extends ClientPhase {
  tasks: (ClientTask & { validation?: TaskValidation })[];
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

const STATUS_LEGEND = [
  { color: "#94A3B8", label: "Pendiente", pulse: false },
  { color: "#3B82F6", label: "En progreso", pulse: true },
  { color: "#F59E0B", label: "Requiere info", pulse: false },
  { color: "#4F46E5", label: "En validación", pulse: false },
  { color: "#059669", label: "Completado", pulse: false },
];

export default function PortalPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const phaseRefs = useRef<Map<string, HTMLElement>>(new Map());

  const [phases, setPhases] = useState<PhaseWithTasks[]>([]);
  const [hasProject, setHasProject] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<
    (ClientTask & { validation?: TaskValidation }) | null
  >(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role === "admin") router.replace("/dashboard/admin");
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    if (!authLoading && user && profile?.role !== "admin") load();
  }, [authLoading, user, profile]);

  const load = async () => {
    setLoading(true);

    const { data: project } = await supabase
      .from("client_projects")
      .select("*")
      .eq("client_id", user!.id)
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
  };

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
          background: "#F5F7FB",
        }}
      >
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        <p style={{ fontSize: "13px", color: "#94A3B8" }}>Cargando...</p>
      </div>
    );
  }

  const totalProgress = calcTotalProgress(phases);

  const handlePhaseClick = (phaseId: string) => {
    const el = phaseRefs.current.get(phaseId);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  const sidebarPhases = phases.map((p) => ({
    id: p.id,
    phase_number: p.phase_number,
    name: p.name,
    progress: calcPhaseProgress(p.tasks),
  }));

  return (
    <>
      <PortalHeader
        companyName={profile?.company_name ?? null}
        totalProgress={totalProgress}
      />

      <div style={{ display: "flex" }}>
        {/* Fixed sidebar — only rendered when there's data */}
        {!loading && hasProject && phases.length > 0 && (
          <PhaseSidebar phases={sidebarPhases} onPhaseClick={handlePhaseClick} />
        )}

        {/* Main content */}
        <main
          className="flex-1 min-[900px]:ml-[180px]"
          style={{ padding: "24px 32px" }}
        >
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
              <p style={{ fontSize: "13px", color: "#94A3B8" }}>
                Cargando proyecto...
              </p>
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
              <p style={{ fontSize: "32px" }}>🚀</p>
              <p
                style={{
                  marginTop: "12px",
                  fontSize: "15px",
                  fontWeight: 600,
                  color: "#0F1629",
                }}
              >
                Tu proyecto aún no ha sido configurado.
              </p>
              <p
                style={{
                  marginTop: "4px",
                  fontSize: "13px",
                  color: "#94A3B8",
                }}
              >
                Contacta a tu administrador.
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
                No hay fases configuradas en tu proyecto.
              </p>
            </div>
          ) : (
            <>
              {/* Status legend */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  marginBottom: "20px",
                }}
              >
                {STATUS_LEGEND.map(({ color, label, pulse }) => (
                  <div
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <div
                      className={pulse ? "animate-pulse" : ""}
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{ fontSize: "12px", color: "#94A3B8" }}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Phase cards */}
              {phases.map((phase, i) => {
                const phaseProgress = calcPhaseProgress(phase.tasks);
                return (
                  <div
                    key={phase.id}
                    ref={(el) => {
                      if (el) phaseRefs.current.set(phase.id, el);
                    }}
                    style={{ scrollMarginTop: "80px" }}
                  >
                    <PhaseCard
                      phase={phase}
                      tasks={phase.tasks}
                      defaultOpen={i === 0}
                      progress={phaseProgress}
                      onTaskClick={(task) =>
                        setSelectedTask(
                          task as ClientTask & { validation?: TaskValidation }
                        )
                      }
                    />
                  </div>
                );
              })}
            </>
          )}
        </main>
      </div>

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
