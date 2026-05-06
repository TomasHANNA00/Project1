"use client";

import type { ClientTask, TaskValidation } from "@/lib/types";
import { isClientActionable, effectiveDueDate } from "@/lib/portalTaskStatus";
import TaskRow from "./TaskRow";

type ClientTaskWithValidation = ClientTask & { validation?: TaskValidation };

interface PhaseDetailProps {
  phase: {
    id: string;
    phase_number: number;
    name: string;
    progress: number;
    totalPhases: number;
    completedTaskCount: number;
    totalTaskCount: number;
    lastUpdated: string | null;
  };
  company: string | null;
  projectCreatedAt: string | null;
  isAdmin?: boolean;
  vambeTasks: ClientTaskWithValidation[];
  clientTasks: ClientTaskWithValidation[];
  onTaskClick: (task: ClientTaskWithValidation) => void;
  onPhaseFilesRender: () => React.ReactNode;
  onContinueClick: (() => void) | null;
  continueLabel: string | null;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "hace un momento";
  if (mins < 60) return `hace ${mins} minuto${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} hora${hrs !== 1 ? "s" : ""}`;
  const days = Math.floor(hrs / 24);
  return `hace ${days} día${days !== 1 ? "s" : ""}`;
}

const CARD_STYLE: React.CSSProperties = {
  background: "white",
  borderRadius: "16px",
  border: "1px solid var(--portal-line-1)",
  padding: "20px 24px",
  marginBottom: "12px",
};

export default function PhaseDetail({
  phase,
  company,
  projectCreatedAt,
  isAdmin = false,
  vambeTasks,
  clientTasks,
  onTaskClick,
  onPhaseFilesRender,
  onContinueClick,
  continueLabel,
}: PhaseDetailProps) {
  const isDone = phase.progress >= 100;
  const lastUpdatedStr = relativeTime(phase.lastUpdated);

  return (
    <div>
      {/* A. Phase header card */}
      <div style={{ ...CARD_STYLE, padding: "24px" }}>
        {/* Top: left content + right % */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: "16px", justifyContent: "space-between" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Eyebrow */}
            <p style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--portal-fg-5)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: "8px",
              margin: "0 0 8px",
            }}>
              FASE {phase.phase_number} DE {phase.totalPhases}
            </p>

            {/* Badge + title row */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: "18px",
                ...(isDone
                  ? { background: "var(--portal-green)", color: "white" }
                  : { background: "var(--portal-blue)", color: "white" }),
              }}>
                {isDone ? (
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 10L8.5 14.5L16 7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : phase.phase_number}
              </div>
              <h2 style={{
                fontSize: "24px",
                fontWeight: 800,
                color: "var(--portal-fg-1)",
                margin: 0,
                lineHeight: 1.2,
              }}>
                {phase.name}
              </h2>
            </div>

            {/* Last updated */}
            <p style={{ fontSize: "11px", color: "var(--portal-fg-5)", margin: "6px 0 0" }}>
              {lastUpdatedStr ? `Última actualización: ${lastUpdatedStr}` : "Sin actividad reciente"}
            </p>
          </div>

          {/* Right: big % */}
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "var(--portal-fg-1)", lineHeight: 1 }}>
              {Math.round(phase.progress)}%
            </div>
            <div style={{ fontSize: "11px", color: "var(--portal-fg-5)", marginTop: "4px" }}>
              {phase.completedTaskCount} de {phase.totalTaskCount}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div style={{
          marginTop: "16px",
          height: "6px",
          borderRadius: "4px",
          background: "var(--portal-line-2)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            borderRadius: "4px",
            background: isDone ? "var(--portal-green)" : "var(--portal-blue)",
            width: `${Math.min(100, phase.progress)}%`,
            transition: "width 0.5s ease",
          }} />
        </div>
      </div>

      {/* B. Vambe block */}
      {vambeTasks.length > 0 && (
        <div style={CARD_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--portal-violet)", flexShrink: 0 }} />
            <span style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--portal-violet)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}>
              REVISARLO JUNTO CON EL EQUIPO DE VAMBE
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {vambeTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                mode="vambe"
                onClick={isAdmin ? () => onTaskClick(task) : undefined}
                effectiveDueDate={effectiveDueDate(task, projectCreatedAt)}
              />
            ))}
          </div>
        </div>
      )}

      {/* C. Client block */}
      {clientTasks.length > 0 && (
        <div style={CARD_STYLE}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--portal-blue)", flexShrink: 0 }} />
            <span style={{
              fontSize: "11px",
              fontWeight: 700,
              color: "var(--portal-blue)",
              textTransform: "uppercase",
              letterSpacing: "0.12em",
            }}>
              {company ? `TÚ (${company.toUpperCase()}) TIENES QUE` : "TÚ TIENES QUE"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {clientTasks.map((task) => {
              const actionable = isAdmin || isClientActionable(task);
              return (
                <TaskRow
                  key={task.id}
                  task={task}
                  mode="client"
                  onClick={actionable ? () => onTaskClick(task) : undefined}
                  effectiveDueDate={effectiveDueDate(task, projectCreatedAt)}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* D. Phase files slot */}
      <div style={{ marginBottom: "12px" }}>
        {onPhaseFilesRender()}
      </div>

      {/* E. CTA */}
      {continueLabel && (
        <div style={{ display: "flex", justifyContent: "center", paddingBottom: "32px" }}>
          <button
            onClick={() => onContinueClick?.()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              maxWidth: "360px",
              width: "100%",
              height: 48,
              justifyContent: "center",
              background: "var(--portal-blue)",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontWeight: 700,
              fontSize: "14px",
              cursor: "pointer",
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            {continueLabel}
          </button>
        </div>
      )}
    </div>
  );
}
