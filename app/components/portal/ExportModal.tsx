"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientPhase, ClientTask } from "@/lib/types";
import { useToast } from "./Toast";

// ── Types ─────────────────────────────────────────────────────────

interface PhaseWithTasks extends ClientPhase {
  tasks: ClientTask[];
}

interface TaskMeta {
  questionCount: number;
  fileCount: number;
}

type ExportFormat = "txt" | "md";

interface ExportModalProps {
  clientId: string;
  companyName: string | null;
  phases: PhaseWithTasks[];
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Export document builders ───────────────────────────────────────

type TaskData = {
  taskName: string;
  questions: {
    questionText: string;
    response: string | null;
    files: { file_name: string; file_size: number | null }[];
  }[];
};

type PhaseData = {
  phaseName: string;
  tasks: TaskData[];
};

function buildTxt(
  companyName: string,
  dateStr: string,
  selectedCount: number,
  totalExportable: number,
  phaseData: PhaseData[]
): string {
  const lines: string[] = [];
  const hr = "=".repeat(64);
  const phr = "─".repeat(64);

  lines.push(hr);
  lines.push("VAMBE — EXPORTACIÓN DE DATOS DEL CLIENTE");
  lines.push(hr);
  lines.push(`Cliente: ${companyName}`);
  lines.push(`Empresa: ${companyName}`);
  lines.push(`Fecha de exportación: ${dateStr}`);
  lines.push(`Tareas exportadas: ${selectedCount} de ${totalExportable}`);
  lines.push(hr);

  for (const phase of phaseData) {
    lines.push("");
    lines.push(phr);
    lines.push(phase.phaseName.toUpperCase());
    lines.push(phr);

    for (const task of phase.tasks) {
      lines.push("");
      lines.push(`▸ ${task.taskName.toUpperCase()}`);
      lines.push("─".repeat(task.taskName.length + 2));

      task.questions.forEach((q, i) => {
        lines.push("");
        lines.push(`  Pregunta ${i + 1}: ${q.questionText}`);
        lines.push("  Respuesta:");
        if (q.response && q.response.trim()) {
          const indented = q.response
            .split("\n")
            .map((l) => `  ${l}`)
            .join("\n");
          lines.push(indented);
        } else {
          lines.push("  (Sin respuesta)");
        }

        if (q.files.length > 0) {
          lines.push("");
          lines.push("  📎 Archivos adjuntos:");
          for (const f of q.files) {
            const size = f.file_size ? ` (${formatFileSize(f.file_size)})` : "";
            lines.push(`  - ${f.file_name}${size}`);
          }
        }
      });

      lines.push("");
    }
  }

  lines.push("");
  lines.push(hr);
  lines.push("FIN DEL REPORTE");
  lines.push(hr);

  return lines.join("\n");
}

function buildMd(
  companyName: string,
  dateStr: string,
  selectedCount: number,
  totalExportable: number,
  phaseData: PhaseData[]
): string {
  const lines: string[] = [];

  lines.push("# VAMBE — Exportación de Datos del Cliente");
  lines.push("");
  lines.push(`- **Cliente:** ${companyName}`);
  lines.push(`- **Empresa:** ${companyName}`);
  lines.push(`- **Fecha de exportación:** ${dateStr}`);
  lines.push(`- **Tareas exportadas:** ${selectedCount} de ${totalExportable}`);
  lines.push("");
  lines.push("---");

  for (const phase of phaseData) {
    lines.push("");
    lines.push(`## ${phase.phaseName}`);
    lines.push("");

    for (const task of phase.tasks) {
      lines.push(`### ${task.taskName}`);
      lines.push("");

      task.questions.forEach((q, i) => {
        lines.push(`**Pregunta ${i + 1}:** ${q.questionText}`);
        lines.push("");
        if (q.response && q.response.trim()) {
          lines.push(q.response);
        } else {
          lines.push("_(Sin respuesta)_");
        }
        lines.push("");

        if (q.files.length > 0) {
          lines.push("**📎 Archivos adjuntos:**");
          for (const f of q.files) {
            const size = f.file_size ? ` _(${formatFileSize(f.file_size)})_` : "";
            lines.push(`- ${f.file_name}${size}`);
          }
          lines.push("");
        }
      });
    }
  }

  lines.push("---");
  lines.push("_Generado por Vambe_");

  return lines.join("\n");
}

// ── Component ─────────────────────────────────────────────────────

export default function ExportModal({
  clientId,
  companyName,
  phases,
  onClose,
}: ExportModalProps) {
  const { showToast } = useToast();

  // Only info_request tasks are exportable
  const exportablePhases = phases
    .map((p) => ({
      ...p,
      tasks: p.tasks.filter((t) => t.task_type === "info_request"),
    }))
    .filter((p) => p.tasks.length > 0);

  const allExportableTaskIds = exportablePhases.flatMap((p) => p.tasks.map((t) => t.id));

  // Task metadata (question counts, file counts)
  const [taskMeta, setTaskMeta] = useState<Map<string, TaskMeta>>(new Map());
  const [loadingMeta, setLoadingMeta] = useState(true);

  // Checked task IDs (default: all checked)
  const [checkedTasks, setCheckedTasks] = useState<Set<string>>(
    new Set(allExportableTaskIds)
  );

  const [format, setFormat] = useState<ExportFormat>("txt");
  const [exporting, setExporting] = useState(false);

  // ── Load question + file counts ──────────────────────────────────
  useEffect(() => {
    if (allExportableTaskIds.length === 0) {
      setLoadingMeta(false);
      return;
    }

    async function loadMeta() {
      const { data: questions } = await supabase
        .from("task_questions")
        .select("id, task_id")
        .in("task_id", allExportableTaskIds);

      const questionsByTask = new Map<string, string[]>();
      for (const q of questions ?? []) {
        if (!questionsByTask.has(q.task_id)) questionsByTask.set(q.task_id, []);
        questionsByTask.get(q.task_id)!.push(q.id);
      }

      const allQIds = (questions ?? []).map((q) => q.id);
      let filesByQuestion = new Map<string, number>();

      if (allQIds.length > 0) {
        const { data: files } = await supabase
          .from("task_files")
          .select("question_id")
          .in("question_id", allQIds);

        for (const f of files ?? []) {
          filesByQuestion.set(f.question_id, (filesByQuestion.get(f.question_id) ?? 0) + 1);
        }
      }

      const meta = new Map<string, TaskMeta>();
      for (const taskId of allExportableTaskIds) {
        const qIds = questionsByTask.get(taskId) ?? [];
        const fileCount = qIds.reduce((sum, qId) => sum + (filesByQuestion.get(qId) ?? 0), 0);
        meta.set(taskId, { questionCount: qIds.length, fileCount });
      }

      setTaskMeta(meta);
      setLoadingMeta(false);
    }

    loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Checklist handlers ───────────────────────────────────────────

  const isPhaseChecked = useCallback(
    (phase: (typeof exportablePhases)[0]) => {
      return phase.tasks.every((t) => checkedTasks.has(t.id));
    },
    [checkedTasks]
  );

  const isPhaseIndeterminate = useCallback(
    (phase: (typeof exportablePhases)[0]) => {
      const checked = phase.tasks.filter((t) => checkedTasks.has(t.id)).length;
      return checked > 0 && checked < phase.tasks.length;
    },
    [checkedTasks]
  );

  const togglePhase = (phase: (typeof exportablePhases)[0]) => {
    const allChecked = isPhaseChecked(phase);
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      for (const t of phase.tasks) {
        if (allChecked) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  };

  const toggleTask = (taskId: string) => {
    setCheckedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // ── Export logic ─────────────────────────────────────────────────

  const handleExport = async () => {
    if (checkedTasks.size === 0) return;
    setExporting(true);

    try {
      const phaseData: PhaseData[] = [];

      for (const phase of exportablePhases) {
        const selectedTasks = phase.tasks.filter((t) => checkedTasks.has(t.id));
        if (selectedTasks.length === 0) continue;

        const taskDataList: TaskData[] = [];

        for (const task of selectedTasks) {
          const { data: questions } = await supabase
            .from("task_questions")
            .select("id, question_text, sort_order")
            .eq("task_id", task.id)
            .order("sort_order");

          if (!questions || questions.length === 0) continue;

          const qIds = questions.map((q) => q.id);

          const { data: responses } = await supabase
            .from("task_responses")
            .select("question_id, text_content")
            .eq("client_id", clientId)
            .in("question_id", qIds);

          const { data: files } = await supabase
            .from("task_files")
            .select("question_id, file_name, file_size")
            .eq("client_id", clientId)
            .in("question_id", qIds);

          const responseMap = new Map(
            (responses ?? []).map((r) => [r.question_id, r.text_content])
          );

          const filesByQuestion = new Map<
            string,
            { file_name: string; file_size: number | null }[]
          >();
          for (const f of files ?? []) {
            if (!filesByQuestion.has(f.question_id)) filesByQuestion.set(f.question_id, []);
            filesByQuestion.get(f.question_id)!.push({ file_name: f.file_name, file_size: f.file_size });
          }

          taskDataList.push({
            taskName: task.name,
            questions: questions.map((q) => ({
              questionText: q.question_text,
              response: responseMap.get(q.id) ?? null,
              files: filesByQuestion.get(q.id) ?? [],
            })),
          });
        }

        if (taskDataList.length > 0) {
          phaseData.push({
            phaseName: `Fase ${phase.phase_number}: ${phase.name}`,
            tasks: taskDataList,
          });
        }
      }

      const dateStr = formatDate(new Date().toISOString());
      const company = companyName ?? "Cliente";
      const selectedCount = checkedTasks.size;
      const totalExportable = allExportableTaskIds.length;

      const content =
        format === "md"
          ? buildMd(company, dateStr, selectedCount, totalExportable, phaseData)
          : buildTxt(company, dateStr, selectedCount, totalExportable, phaseData);

      const slug = company.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
      const dateSlug = new Date().toISOString().split("T")[0];
      const ext = format === "md" ? "md" : "txt";
      const filename = `${slug}_export_${dateSlug}.${ext}`;

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      showToast("Exportación descargada");
      onClose();
    } catch (err) {
      console.error("[ExportModal] export error:", err);
      showToast("Error al generar la exportación", "error");
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────

  const hasSelection = checkedTasks.size > 0;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,22,41,0.45)",
          zIndex: 100,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 101,
          background: "white",
          borderRadius: "16px",
          boxShadow: "0 24px 64px rgba(15,22,41,0.20)",
          width: "min(520px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: "1px solid #E2E8F0",
            flexShrink: 0,
          }}
        >
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#0F1629",
                margin: 0,
              }}
            >
              Exportar información
            </h2>
            {companyName && (
              <p
                style={{
                  fontSize: "12px",
                  color: "#64748B",
                  margin: "2px 0 0",
                }}
              >
                {companyName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94A3B8",
              padding: "4px",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div
          style={{
            overflowY: "auto",
            padding: "20px 24px",
            flex: 1,
          }}
        >
          {loadingMeta ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "32px",
              }}
            >
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : exportablePhases.length === 0 ? (
            <p
              style={{
                fontSize: "13px",
                color: "#94A3B8",
                textAlign: "center",
                padding: "32px 0",
              }}
            >
              No hay tareas con datos exportables en este proyecto.
            </p>
          ) : (
            <>
              {/* Format selector */}
              <div
                style={{
                  marginBottom: "20px",
                  display: "flex",
                  gap: "8px",
                }}
              >
                {(["txt", "md"] as ExportFormat[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "8px",
                      border: `1.5px solid ${format === f ? "#3B82F6" : "#E2E8F0"}`,
                      background: format === f ? "#EFF6FF" : "white",
                      color: format === f ? "#1D4ED8" : "#64748B",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {f === "txt" ? "Texto estructurado (.txt)" : "Markdown (.md)"}
                  </button>
                ))}
              </div>

              {/* Checklist */}
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {phases.map((phase) => {
                  const exportable = phase.tasks.filter((t) => t.task_type === "info_request");
                  const hasExportable = exportable.length > 0;

                  return (
                    <div key={phase.id} style={{ marginBottom: "8px" }}>
                      {/* Phase row */}
                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          cursor: hasExportable ? "pointer" : "default",
                          background: hasExportable ? undefined : "#FAFAFA",
                        }}
                      >
                        <input
                          type="checkbox"
                          disabled={!hasExportable}
                          checked={
                            hasExportable
                              ? exportablePhases
                                  .find((p) => p.id === phase.id)
                                  ?.tasks.every((t) => checkedTasks.has(t.id)) ?? false
                              : false
                          }
                          ref={(el) => {
                            if (el) {
                              const ep = exportablePhases.find((p) => p.id === phase.id);
                              el.indeterminate = ep
                                ? isPhaseIndeterminate(ep)
                                : false;
                            }
                          }}
                          onChange={() => {
                            const ep = exportablePhases.find((p) => p.id === phase.id);
                            if (ep) togglePhase(ep);
                          }}
                          style={{ accentColor: "#0F1629", width: "14px", height: "14px" }}
                        />
                        <span
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: hasExportable ? "#0F1629" : "#CBD5E1",
                          }}
                        >
                          Fase {phase.phase_number}: {phase.name}
                        </span>
                        {!hasExportable && (
                          <span
                            style={{
                              fontSize: "11px",
                              color: "#CBD5E1",
                              marginLeft: "auto",
                            }}
                          >
                            sin datos exportables
                          </span>
                        )}
                      </label>

                      {/* Task rows */}
                      {exportable.map((task) => {
                        const meta = taskMeta.get(task.id);
                        return (
                          <label
                            key={task.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              padding: "6px 10px 6px 32px",
                              borderRadius: "6px",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) =>
                              ((e.currentTarget as HTMLLabelElement).style.background = "#F8FAFC")
                            }
                            onMouseLeave={(e) =>
                              ((e.currentTarget as HTMLLabelElement).style.background = "")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={checkedTasks.has(task.id)}
                              onChange={() => toggleTask(task.id)}
                              style={{ accentColor: "#0F1629", width: "13px", height: "13px" }}
                            />
                            <span
                              style={{
                                fontSize: "13px",
                                color: "#334155",
                                flex: 1,
                              }}
                            >
                              {task.name}
                            </span>
                            <span style={{ fontSize: "11px", color: "#94A3B8", whiteSpace: "nowrap" }}>
                              {meta
                                ? [
                                    `${meta.questionCount} ${meta.questionCount === 1 ? "pregunta" : "preguntas"}`,
                                    meta.fileCount > 0
                                      ? `${meta.fileCount} ${meta.fileCount === 1 ? "archivo" : "archivos"}`
                                      : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")
                                : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "8px",
            padding: "16px 24px",
            borderTop: "1px solid #E2E8F0",
            flexShrink: 0,
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: "8px 16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              color: "#64748B",
              borderRadius: "8px",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#0F1629")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#64748B")}
          >
            Cancelar
          </button>

          <button
            onClick={handleExport}
            disabled={!hasSelection || exporting || loadingMeta}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 18px",
              background: !hasSelection || exporting || loadingMeta ? "#94A3B8" : "#0F1629",
              border: "none",
              borderRadius: "8px",
              cursor: !hasSelection || exporting || loadingMeta ? "not-allowed" : "pointer",
              fontSize: "13px",
              fontWeight: 600,
              color: "white",
              transition: "background 0.15s",
            }}
          >
            {exporting ? (
              <>
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Generando exportación...
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 1v8M4 6l3 3 3-3M2 11h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Exportar selección
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
}
