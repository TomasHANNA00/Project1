"use client";

import { useState } from "react";
import type { ClientPhase, ClientTask, PhaseFile, TaskValidation } from "@/lib/types";
import TaskItem from "./TaskItem";
import PhaseFiles from "./PhaseFiles";

interface PhaseCardProps {
  phase: ClientPhase;
  tasks: (ClientTask & { validation?: TaskValidation })[];
  defaultOpen?: boolean;
  progress: number;
  onTaskClick?: (task: ClientTask) => void;
  isAdmin?: boolean;
  onCheckboxClick?: (task: ClientTask) => void;
  onAddTask?: (phaseId: string) => void;
  onDueDateChange?: (taskId: string, date: string) => void;
  onOwnerLabelChange?: (taskId: string, label: string) => void;
  onNameChange?: (taskId: string, name: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onOwnerTypeChange?: (taskId: string, ownerType: "client" | "vambe", label: string) => void;
  onPhaseNameChange?: (phaseId: string, name: string) => void;
  phaseFiles?: PhaseFile[];
  clientId?: string;
}

export default function PhaseCard({
  phase,
  tasks,
  defaultOpen = false,
  progress,
  onTaskClick,
  isAdmin,
  onCheckboxClick,
  onAddTask,
  onDueDateChange,
  onOwnerLabelChange,
  onNameChange,
  onDeleteTask,
  onOwnerTypeChange,
  onPhaseNameChange,
  phaseFiles = [],
  clientId,
}: PhaseCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingPhaseName, setEditingPhaseName] = useState(false);
  const [phaseNameValue, setPhaseNameValue] = useState(phase.name);

  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const isDone = progress >= 100;
  const hasProgress = progress > 0;

  return (
    <div
      style={{
        borderRadius: "16px",
        border: "1px solid #E2E8F0",
        background: "white",
        overflow: "hidden",
        marginBottom: "12px",
      }}
    >
      {/* Header row */}
      <div
        onClick={() => {
          if (!editingPhaseName) setOpen(!open);
        }}
        className="hover:bg-[#F8FAFC] transition-colors"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "16px 20px",
          cursor: "pointer",
        }}
      >
        {/* Numbered circle */}
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "15px",
            fontWeight: 700,
            color: "white",
            background: isDone
              ? "#059669"
              : "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
            boxShadow: isDone
              ? "0 2px 8px rgba(5,150,105,0.25)"
              : "0 2px 8px rgba(59,130,246,0.25)",
          }}
        >
          {isDone ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8L6.5 11.5L13 5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            phase.phase_number
          )}
        </div>

        {/* Name + progress bar */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {editingPhaseName && isAdmin ? (
            <input
              type="text"
              value={phaseNameValue}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setPhaseNameValue(e.target.value)}
              onBlur={() => {
                setEditingPhaseName(false);
                const trimmed = phaseNameValue.trim();
                if (trimmed && trimmed !== phase.name) {
                  onPhaseNameChange?.(phase.id, trimmed);
                } else {
                  setPhaseNameValue(phase.name);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") {
                  setPhaseNameValue(phase.name);
                  setEditingPhaseName(false);
                }
              }}
              style={{
                width: "100%",
                fontSize: "15px",
                fontWeight: 600,
                color: "#0F1629",
                border: "1px solid #3B82F6",
                borderRadius: "6px",
                padding: "3px 8px",
                outline: "none",
                fontFamily: "inherit",
                background: "#F0F9FF",
                marginBottom: "8px",
              }}
            />
          ) : (
            <p
              onClick={(e) => {
                if (isAdmin) {
                  e.stopPropagation();
                  setEditingPhaseName(true);
                }
              }}
              title={isAdmin ? "Clic para editar nombre de la fase" : undefined}
              style={{
                fontSize: "15px",
                fontWeight: 600,
                color: "#0F1629",
                marginBottom: "8px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                cursor: isAdmin ? "text" : "default",
                padding: isAdmin ? "3px 6px" : "0",
                borderRadius: "4px",
                border: isAdmin ? "1px dashed transparent" : "none",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (isAdmin) (e.currentTarget as HTMLParagraphElement).style.borderColor = "#CBD5E1";
              }}
              onMouseLeave={(e) => {
                if (isAdmin) (e.currentTarget as HTMLParagraphElement).style.borderColor = "transparent";
              }}
            >
              {phaseNameValue}
            </p>
          )}
          <div
            style={{ display: "flex", alignItems: "center", gap: "10px" }}
          >
            <div
              style={{
                flex: 1,
                maxWidth: "280px",
                height: "6px",
                borderRadius: "100px",
                background: "#E2E8F0",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: "100px",
                  background: isDone ? "#059669" : "#3B82F6",
                  width: `${Math.min(100, progress)}%`,
                  transition: "width 0.5s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 500,
                color: isDone ? "#059669" : hasProgress ? "#3B82F6" : "#94A3B8",
                flexShrink: 0,
              }}
            >
              {Math.round(progress)}%
            </span>
          </div>
        </div>

        {/* Task counter */}
        <span
          style={{
            fontSize: "12px",
            color: "#94A3B8",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          {completedCount}/{tasks.length} tareas
        </span>

        {/* Chevron */}
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            color: "#94A3B8",
          }}
        >
          <path
            d="M6 4L10 8L6 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Task list */}
      {open && (
        <div style={{ borderTop: "1px solid #F1F5F9" }}>
          {/* Phase-level file uploads */}
          {clientId && (
            <PhaseFiles
              phaseId={phase.id}
              clientId={clientId}
              initialFiles={phaseFiles}
            />
          )}

          {tasks.length === 0 ? (
            <p
              style={{
                padding: "16px 20px",
                fontSize: "13px",
                color: "#94A3B8",
              }}
            >
              No hay tareas en esta fase.
            </p>
          ) : (
            tasks.map((task, index) => {
              const prevTask = index > 0 ? tasks[index - 1] : null;
              const showSectionHeader =
                task.section_label != null &&
                (prevTask == null || prevTask.section_label !== task.section_label);
              return (
                <div key={task.id}>
                  {showSectionHeader && index > 0 && (
                    <div style={{ borderTop: "1px solid #E2E8F0", margin: "0 20px" }} />
                  )}
                  {showSectionHeader && (
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                        color: "#64748B",
                        padding: index === 0 ? "14px 20px 6px" : "16px 20px 6px",
                      }}
                    >
                      {task.section_label}
                    </div>
                  )}
                  <TaskItem
                    task={task}
                    onTaskClick={task.task_type !== "hito" ? onTaskClick : undefined}
                    isAdmin={isAdmin}
                    onCheckboxClick={onCheckboxClick}
                    onDueDateChange={onDueDateChange}
                    onOwnerLabelChange={onOwnerLabelChange}
                    onNameChange={onNameChange}
                    onDeleteTask={onDeleteTask}
                    onOwnerTypeChange={onOwnerTypeChange}
                  />
                </div>
              );
            })
          )}

          {/* Admin: Add task button */}
          {isAdmin && onAddTask && (
            <div
              style={{
                padding: "12px 20px",
                borderTop: tasks.length > 0 ? "1px solid #F1F5F9" : "none",
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddTask(phase.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "7px 14px",
                  borderRadius: "8px",
                  border: "1.5px dashed #CBD5E1",
                  background: "none",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  color: "#64748B",
                  transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.borderColor = "#3B82F6";
                  el.style.color = "#3B82F6";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.borderColor = "#CBD5E1";
                  el.style.color = "#64748B";
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Agregar tarea
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
