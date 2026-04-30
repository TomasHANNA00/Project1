"use client";

import type { ClientTask, TaskValidation } from "@/lib/types";
import { derivePortalTaskState } from "@/lib/portalTaskStatus";

interface TaskRowProps {
  task: ClientTask & { validation?: TaskValidation };
  mode: "vambe" | "client";
  onClick?: () => void;
  fileCount?: number;
  effectiveDueDate?: string | null;
}

function formatDueDate(dateStr: string): string {
  return new Intl.DateTimeFormat("es", { day: "2-digit", month: "short" }).format(
    new Date(dateStr + "T00:00:00")
  );
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.ceil((due.getTime() - today.getTime()) / 86_400_000);
}

function CheckboxEmpty() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        border: "1.5px solid var(--portal-fg-5)",
        background: "white",
        flexShrink: 0,
      }}
    />
  );
}

function CheckboxDone() {
  return (
    <div
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        background: "var(--portal-blue)",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2 5.5L4.5 8L9 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function TaskRow({ task, onClick, fileCount, effectiveDueDate }: TaskRowProps) {
  const state = derivePortalTaskState(task);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "14px 16px",
    borderRadius: "12px",
    border: "1px solid",
    cursor: onClick ? "pointer" : "default",
    transition: "background 0.15s",
    ...(state === "client_pending"
      ? { background: "var(--portal-amber-bg)", borderColor: "var(--portal-amber-border)" }
      : state === "client_in_review"
      ? { background: "var(--portal-blue-lighter)", borderColor: "var(--portal-blue-light)" }
      : { background: "white", borderColor: "var(--portal-line-1)" }),
  };

  if (state === "vambe_pending") {
    return (
      <div style={rowStyle} onClick={onClick}>
        <CheckboxEmpty />
        <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, color: "var(--portal-fg-2)" }}>
          {task.name}
        </span>
        <span style={{ fontSize: "11px", color: "var(--portal-fg-5)", whiteSpace: "nowrap", flexShrink: 0 }}>
          fecha por definir
        </span>
      </div>
    );
  }

  if (state === "vambe_done") {
    return (
      <div style={rowStyle} onClick={onClick}>
        <CheckboxDone />
        <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, color: "var(--portal-fg-5)", textDecoration: "line-through" }}>
          {task.name}
        </span>
        <span style={{ fontSize: "11px", color: "var(--portal-fg-5)", whiteSpace: "nowrap", flexShrink: 0 }}>
          fecha por definir
        </span>
      </div>
    );
  }

  if (state === "client_pending") {
    const days = effectiveDueDate ? daysUntil(effectiveDueDate) : null;
    const isUrgent = days !== null && days <= 7;
    return (
      <div style={rowStyle} onClick={onClick}>
        <CheckboxEmpty />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--portal-fg-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.name}
          </p>
          {effectiveDueDate && (
            <p style={{
              fontSize: "11px",
              fontWeight: 600,
              color: isUrgent ? "var(--portal-amber-text)" : "var(--portal-fg-5)",
              margin: "2px 0 0",
            }}>
              {isUrgent
                ? (days! <= 0 ? "Vence hoy" : `Vence en ${days} día${days !== 1 ? "s" : ""}`)
                : `Vence ${formatDueDate(effectiveDueDate)}`}
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {/* Clip icon button */}
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: "1px solid var(--portal-line-1)",
              background: "white",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--portal-fg-5)",
              transition: "border-color 0.15s, color 0.15s",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--portal-blue)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--portal-blue)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--portal-line-1)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--portal-fg-5)";
            }}
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path d="M13 7L7.5 12.5C6.1 13.9 3.9 13.9 2.5 12.5C1.1 11.1 1.1 8.9 2.5 7.5L8 2C8.9 1.1 10.3 1.1 11.2 2C12.1 2.9 12.1 4.3 11.2 5.2L5.7 10.7C5.3 11.1 4.6 11.1 4.2 10.7C3.8 10.3 3.8 9.6 4.2 9.2L9.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {/* Main CTA */}
          <button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "none",
              background: "var(--portal-blue)",
              color: "white",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Llena tu información aquí →
          </button>
        </div>
      </div>
    );
  }

  if (state === "client_in_review") {
    return (
      <div style={rowStyle} onClick={onClick}>
        <CheckboxEmpty />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--portal-fg-2)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {task.name}
            </p>
            <span style={{
              background: "var(--portal-blue)",
              color: "white",
              padding: "2px 8px",
              borderRadius: 999,
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}>
              EN REVISIÓN
            </span>
          </div>
          <p style={{ fontSize: "11px", fontWeight: 600, color: "var(--portal-blue-deep)", margin: "2px 0 0" }}>
            Vambe está validando
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid var(--portal-blue-light)",
            background: "white",
            color: "var(--portal-blue-deep)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Ver archivos{fileCount !== undefined ? ` (${fileCount})` : ""}
        </button>
      </div>
    );
  }

  // client_done
  return (
    <div style={rowStyle} onClick={onClick}>
      <CheckboxDone />
      <span style={{ flex: 1, fontSize: "14px", fontWeight: 500, color: "var(--portal-fg-5)", textDecoration: "line-through", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.name}
      </span>
      {onClick && (
        <button
          onClick={(e) => { e.stopPropagation(); onClick?.(); }}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: "1px solid var(--portal-line-1)",
            background: "white",
            color: "var(--portal-fg-4)",
            fontSize: "12px",
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Ver archivos
        </button>
      )}
    </div>
  );
}
