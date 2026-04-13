"use client";

import { useEffect, useRef, useState } from "react";
import type { ClientTask, TaskValidation } from "@/lib/types";

interface TaskItemProps {
  task: ClientTask & { validation?: TaskValidation };
  onTaskClick?: (task: ClientTask) => void;
  isAdmin?: boolean;
  onCheckboxClick?: (task: ClientTask) => void;
  onDueDateChange?: (taskId: string, date: string) => void;
  onOwnerLabelChange?: (taskId: string, label: string) => void;
  onNameChange?: (taskId: string, name: string) => void;
  onDeleteTask?: (taskId: string) => void;
  onOwnerTypeChange?: (taskId: string, ownerType: "client" | "vambe", label: string) => void;
}

function formatDueDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

function isPastDue(dateStr: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dateStr + "T00:00:00") < today;
}

function Checkbox({ status }: { status: string }) {
  if (status === "completed") {
    return (
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "5px",
          background: "#059669",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6L5 9L10 3"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  if (status === "in_progress") {
    return (
      <div
        style={{
          width: "20px",
          height: "20px",
          borderRadius: "5px",
          background: "#3B82F6",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "2px",
            background: "rgba(255,255,255,0.65)",
          }}
        />
      </div>
    );
  }
  return (
    <div
      style={{
        width: "20px",
        height: "20px",
        borderRadius: "5px",
        border: "1.5px solid #D1D5DB",
        background: "white",
        flexShrink: 0,
      }}
    />
  );
}

function ActionIcon({ type }: { type: string }) {
  if (type === "hito") {
    return <div style={{ width: "24px", height: "24px", flexShrink: 0 }} />;
  }
  return (
    <div
      style={{
        width: "24px",
        height: "24px",
        borderRadius: "6px",
        background: "#FEF3C7",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {type === "info_request" ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 2v8M2 6h8"
            stroke="#D97706"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M2 6L5 9L10 3"
            stroke="#D97706"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </div>
  );
}

export default function TaskItem({
  task,
  onTaskClick,
  isAdmin,
  onCheckboxClick,
  onDueDateChange,
  onOwnerLabelChange,
  onNameChange,
  onDeleteTask,
  onOwnerTypeChange,
}: TaskItemProps) {
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(task.due_date ?? "");
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(task.name);
  const [rowHovered, setRowHovered] = useState(false);

  // Owner dropdown
  const [showOwnerDropdown, setShowOwnerDropdown] = useState(false);
  const [dropdownType, setDropdownType] = useState<"client" | "vambe">(task.owner_type);
  const [dropdownLabel, setDropdownLabel] = useState(task.owner_label);
  const ownerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showOwnerDropdown) return;
    const handler = (e: MouseEvent) => {
      if (ownerRef.current && !ownerRef.current.contains(e.target as Node)) {
        setShowOwnerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOwnerDropdown]);

  const openOwnerDropdown = () => {
    setDropdownType(task.owner_type);
    setDropdownLabel(task.owner_label);
    setShowOwnerDropdown(true);
  };

  const handleOwnerSave = () => {
    setShowOwnerDropdown(false);
    if (dropdownType !== task.owner_type || dropdownLabel !== task.owner_label) {
      onOwnerTypeChange?.(task.id, dropdownType, dropdownLabel);
    }
  };

  const isCompleted = task.status === "completed";
  const progress = isCompleted
    ? 100
    : task.status === "in_progress"
    ? Number(task.progress ?? 0)
    : 0;
  const overdue =
    !isCompleted && task.due_date ? isPastDue(task.due_date) : false;

  const progressColor =
    progress === 100 ? "#059669" : progress > 0 ? "#3B82F6" : "#94A3B8";

  const canOpenPanel = !!onTaskClick && task.task_type !== "hito";

  return (
    <div
      onClick={() => {
        if (!editingDate && !editingName && !showOwnerDropdown && canOpenPanel) {
          onTaskClick?.(task);
        }
      }}
      className={canOpenPanel ? "hover:bg-[#F8FAFC]" : ""}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "12px 20px",
        borderBottom: "1px solid #F1F5F9",
        cursor: canOpenPanel ? "pointer" : "default",
        background: "white",
        transition: "background 0.1s",
        position: "relative",
      }}
    >
      {/* Checkbox */}
      <div
        onClick={(e) => {
          if (isAdmin && onCheckboxClick) {
            e.stopPropagation();
            onCheckboxClick(task);
          }
        }}
        title={isAdmin ? (isCompleted ? "Marcar como pendiente" : "Marcar como completado") : undefined}
        style={{
          flexShrink: 0,
          cursor: isAdmin ? "pointer" : "default",
          borderRadius: "5px",
          outline: isAdmin ? "2px solid transparent" : "none",
          transition: "outline-color 0.15s",
        }}
        onMouseEnter={(e) => {
          if (isAdmin) (e.currentTarget as HTMLDivElement).style.outlineColor = "#3B82F6";
        }}
        onMouseLeave={(e) => {
          if (isAdmin) (e.currentTarget as HTMLDivElement).style.outlineColor = "transparent";
        }}
      >
        <Checkbox status={task.status} />
      </div>

      {/* Task name — editable when isAdmin */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {editingName && isAdmin ? (
          <input
            type="text"
            value={nameValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              const trimmed = nameValue.trim();
              if (trimmed && trimmed !== task.name) {
                onNameChange?.(task.id, trimmed);
              } else {
                setNameValue(task.name);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setNameValue(task.name);
                setEditingName(false);
              }
            }}
            style={{
              width: "100%",
              fontSize: "13px",
              fontWeight: 500,
              color: "#0F1629",
              border: "1px solid #3B82F6",
              borderRadius: "4px",
              padding: "2px 6px",
              outline: "none",
              fontFamily: "inherit",
              background: "#F0F9FF",
            }}
          />
        ) : (
          <p
            onClick={(e) => {
              if (isAdmin) {
                e.stopPropagation();
                setEditingName(true);
              }
            }}
            title={isAdmin ? "Clic para editar nombre" : undefined}
            style={{
              fontSize: "13px",
              fontWeight: 500,
              color: isCompleted ? "#9CA3AF" : "#0F1629",
              textDecoration: isCompleted ? "line-through" : "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              cursor: isAdmin ? "text" : "default",
              padding: isAdmin ? "2px 4px" : "0",
              borderRadius: "4px",
              border: isAdmin ? "1px dashed transparent" : "none",
              transition: "border-color 0.15s",
              margin: 0,
            }}
            onMouseEnter={(e) => {
              if (isAdmin) (e.currentTarget as HTMLParagraphElement).style.borderColor = "#CBD5E1";
            }}
            onMouseLeave={(e) => {
              if (isAdmin) (e.currentTarget as HTMLParagraphElement).style.borderColor = "transparent";
            }}
          >
            {nameValue}
          </p>
        )}
      </div>

      {/* Due date — hidden on mobile */}
      <div className="hidden min-[900px]:block" style={{ width: "72px", flexShrink: 0 }}>
        {editingDate && isAdmin ? (
          <input
            type="date"
            value={dateValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDateValue(e.target.value)}
            onBlur={() => {
              setEditingDate(false);
              if (dateValue !== (task.due_date ?? "")) {
                onDueDateChange?.(task.id, dateValue);
              }
            }}
            style={{
              width: "100%",
              fontSize: "11px",
              border: "1px solid #3B82F6",
              borderRadius: "4px",
              padding: "2px 4px",
              outline: "none",
              color: "#0F1629",
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              if (isAdmin) {
                e.stopPropagation();
                setEditingDate(true);
              }
            }}
            style={{
              display: "block",
              fontSize: "12px",
              color: overdue ? "#EF4444" : "#94A3B8",
              textAlign: "right",
              cursor: isAdmin ? "pointer" : "default",
              padding: isAdmin ? "2px 4px" : "0",
              borderRadius: "4px",
              border: isAdmin ? "1px dashed transparent" : "none",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (isAdmin) (e.currentTarget as HTMLSpanElement).style.borderColor = "#CBD5E1";
            }}
            onMouseLeave={(e) => {
              if (isAdmin) (e.currentTarget as HTMLSpanElement).style.borderColor = "transparent";
            }}
          >
            {task.due_date ? formatDueDate(task.due_date) : isAdmin ? "— fecha" : ""}
          </span>
        )}
      </div>

      {/* Owner badge with dropdown — hidden on mobile */}
      <div
        ref={ownerRef}
        className="hidden min-[900px]:block"
        style={{ width: "70px", flexShrink: 0, position: "relative" }}
      >
        {showOwnerDropdown ? (
          <>
            {/* Trigger badge (still visible behind dropdown) */}
            <span
              style={{
                display: "block",
                borderRadius: "100px",
                padding: "3px 8px",
                fontSize: "10px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                textAlign: "center",
                background: dropdownType === "vambe" ? "#EDE9FE" : "#DBEAFE",
                color: dropdownType === "vambe" ? "#6D28D9" : "#1D4ED8",
                border: "1px solid",
                borderColor: dropdownType === "vambe" ? "#6D28D9" : "#1D4ED8",
              }}
            >
              {dropdownLabel}
            </span>
            {/* Dropdown panel */}
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "white",
                border: "1px solid #E2E8F0",
                borderRadius: "10px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                zIndex: 20,
                padding: "12px",
                width: "180px",
              }}
            >
              <p style={{ fontSize: "10px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "8px" }}>
                Propietario
              </p>
              <div style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
                <button
                  onClick={() => {
                    setDropdownType("client");
                    setDropdownLabel("CLIENTE");
                  }}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: "6px",
                    border: "1.5px solid",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: dropdownType === "client" ? "#DBEAFE" : "white",
                    borderColor: dropdownType === "client" ? "#1D4ED8" : "#E2E8F0",
                    color: dropdownType === "client" ? "#1D4ED8" : "#64748B",
                  }}
                >
                  Cliente
                </button>
                <button
                  onClick={() => {
                    setDropdownType("vambe");
                    setDropdownLabel("VAMBE");
                  }}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: "6px",
                    border: "1.5px solid",
                    fontSize: "11px",
                    fontWeight: 600,
                    cursor: "pointer",
                    transition: "all 0.15s",
                    background: dropdownType === "vambe" ? "#EDE9FE" : "white",
                    borderColor: dropdownType === "vambe" ? "#6D28D9" : "#E2E8F0",
                    color: dropdownType === "vambe" ? "#6D28D9" : "#64748B",
                  }}
                >
                  VAMBE
                </button>
              </div>
              <input
                type="text"
                value={dropdownLabel}
                onChange={(e) => setDropdownLabel(e.target.value)}
                placeholder="Etiqueta..."
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleOwnerSave();
                  if (e.key === "Escape") setShowOwnerDropdown(false);
                }}
                style={{
                  width: "100%",
                  fontSize: "12px",
                  padding: "5px 8px",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "6px",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box",
                  marginBottom: "8px",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
              />
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setShowOwnerDropdown(false)}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: "6px",
                    border: "1px solid #E2E8F0",
                    background: "white",
                    fontSize: "11px",
                    color: "#64748B",
                    cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleOwnerSave}
                  style={{
                    flex: 1,
                    padding: "5px 0",
                    borderRadius: "6px",
                    border: "none",
                    background: "#0F1629",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  Guardar
                </button>
              </div>
            </div>
          </>
        ) : (
          <span
            onClick={(e) => {
              if (isAdmin) {
                e.stopPropagation();
                openOwnerDropdown();
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "3px",
              borderRadius: "100px",
              padding: "3px 8px",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              background: task.owner_type === "vambe" ? "#EDE9FE" : "#DBEAFE",
              color: task.owner_type === "vambe" ? "#6D28D9" : "#1D4ED8",
              cursor: isAdmin ? "pointer" : "default",
              border: isAdmin ? "1px dashed transparent" : "1px solid transparent",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              if (isAdmin) (e.currentTarget as HTMLSpanElement).style.borderColor = task.owner_type === "vambe" ? "#6D28D9" : "#1D4ED8";
            }}
            onMouseLeave={(e) => {
              if (isAdmin) (e.currentTarget as HTMLSpanElement).style.borderColor = "transparent";
            }}
          >
            {task.owner_label}
            {isAdmin && (
              <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </span>
        )}
      </div>

      {/* Progress % */}
      <span
        style={{
          width: "52px",
          fontSize: "12px",
          fontWeight: 500,
          color: progressColor,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {Math.round(progress)}%
      </span>

      {/* Action icon */}
      <ActionIcon type={task.task_type} />

      {/* Delete button — admin only, visible on hover */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`¿Eliminar la tarea "${task.name}"? Esta acción no se puede deshacer.`)) {
              onDeleteTask?.(task.id);
            }
          }}
          title="Eliminar tarea"
          style={{
            width: "24px",
            height: "24px",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#CBD5E1",
            borderRadius: "4px",
            opacity: rowHovered ? 1 : 0,
            transition: "opacity 0.15s, color 0.15s",
            padding: 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#EF4444")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1")}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 3.5h10M5.5 3.5V2h3v1.5M4 3.5l.7 7.5h4.6l.7-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
