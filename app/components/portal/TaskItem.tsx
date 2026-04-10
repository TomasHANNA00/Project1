"use client";

import { useState } from "react";
import type { ClientTask, TaskValidation } from "@/lib/types";

interface TaskItemProps {
  task: ClientTask & { validation?: TaskValidation };
  onTaskClick?: (task: ClientTask) => void;
  isAdmin?: boolean;
  onCheckboxClick?: (task: ClientTask) => void;
  onDueDateChange?: (taskId: string, date: string) => void;
  onOwnerLabelChange?: (taskId: string, label: string) => void;
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
}: TaskItemProps) {
  const [editingDate, setEditingDate] = useState(false);
  const [dateValue, setDateValue] = useState(task.due_date ?? "");
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(task.owner_label);

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
        if (!editingDate && !editingLabel && canOpenPanel) {
          onTaskClick?.(task);
        }
      }}
      className={canOpenPanel ? "hover:bg-[#F8FAFC]" : ""}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "16px",
        padding: "12px 20px",
        borderBottom: "1px solid #F1F5F9",
        cursor: canOpenPanel ? "pointer" : "default",
        background: "white",
        transition: "background 0.1s",
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

      {/* Task name */}
      <p
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: "13px",
          fontWeight: 500,
          color: isCompleted ? "#9CA3AF" : "#0F1629",
          textDecoration: isCompleted ? "line-through" : "none",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {task.name}
      </p>

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

      {/* Owner badge — hidden on mobile */}
      <div className="hidden min-[900px]:block" style={{ width: "70px", flexShrink: 0 }}>
        {editingLabel && isAdmin ? (
          <input
            type="text"
            value={labelValue}
            autoFocus
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLabelValue(e.target.value)}
            onBlur={() => {
              setEditingLabel(false);
              if (labelValue !== task.owner_label) {
                onOwnerLabelChange?.(task.id, labelValue);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setLabelValue(task.owner_label);
                setEditingLabel(false);
              }
            }}
            style={{
              width: "100%",
              fontSize: "10px",
              fontWeight: 600,
              border: "1px solid #3B82F6",
              borderRadius: "100px",
              padding: "3px 6px",
              outline: "none",
              textAlign: "center",
              background: task.owner_type === "vambe" ? "#EDE9FE" : "#DBEAFE",
              color: task.owner_type === "vambe" ? "#6D28D9" : "#1D4ED8",
            }}
          />
        ) : (
          <span
            onClick={(e) => {
              if (isAdmin) {
                e.stopPropagation();
                setEditingLabel(true);
              }
            }}
            style={{
              display: "block",
              borderRadius: "100px",
              padding: "3px 8px",
              fontSize: "10px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              textAlign: "center",
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
            {labelValue}
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
    </div>
  );
}
