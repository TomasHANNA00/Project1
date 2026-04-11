"use client";

import { useState } from "react";
import type { TaskType, OwnerType } from "@/lib/types";

export interface AddTaskData {
  phaseId: string;
  name: string;
  task_type: TaskType;
  owner_type: OwnerType;
  owner_label: string;
  due_date: string;
  description: string;
  sort_order: number;
  doc_url: string;
  doc_title: string;
  questions: { question_text: string; placeholder: string }[];
}

interface AddTaskModalProps {
  phaseId: string;
  defaultOwnerLabel: string;
  maxSortOrder: number;
  onClose: () => void;
  onAdd: (data: AddTaskData) => Promise<void>;
}

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  hito: "Hito",
  info_request: "Solicitud de información",
  validation: "Solicitud de validación",
};

export default function AddTaskModal({
  phaseId,
  defaultOwnerLabel,
  maxSortOrder,
  onClose,
  onAdd,
}: AddTaskModalProps) {
  const [name, setName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("hito");
  const [ownerType, setOwnerType] = useState<OwnerType>("vambe");
  const [ownerLabel, setOwnerLabel] = useState(defaultOwnerLabel || "VAMBE");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [questions, setQuestions] = useState<{ question_text: string; placeholder: string }[]>([
    { question_text: "", placeholder: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOwnerTypeChange = (ot: OwnerType) => {
    setOwnerType(ot);
    setOwnerLabel(ot === "vambe" ? "VAMBE" : defaultOwnerLabel);
  };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { question_text: "", placeholder: "" }]);
  };

  const removeQuestion = (index: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const updateQuestion = (index: number, field: "question_text" | "placeholder", value: string) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? { ...q, [field]: value } : q)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError("El nombre de la tarea es requerido."); return; }
    if (taskType === "info_request" && questions.some((q) => !q.question_text.trim())) {
      setError("Completa el texto de todas las preguntas.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onAdd({
        phaseId,
        name: name.trim(),
        task_type: taskType,
        owner_type: ownerType,
        owner_label: ownerLabel.trim() || (ownerType === "vambe" ? "VAMBE" : defaultOwnerLabel),
        due_date: dueDate,
        description: description.trim(),
        sort_order: maxSortOrder + 1,
        doc_url: docUrl.trim(),
        doc_title: docTitle.trim(),
        questions: taskType === "info_request"
          ? questions.filter((q) => q.question_text.trim())
          : [],
      });
      onClose();
    } catch {
      setError("Error al crear la tarea. Intenta de nuevo.");
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,22,41,0.45)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: "white",
          borderRadius: "16px",
          border: "1px solid #E2E8F0",
          width: "100%",
          maxWidth: "520px",
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0F1629" }}>
              Agregar tarea
            </p>
            <p style={{ fontSize: "12px", color: "#94A3B8", marginTop: "2px" }}>
              La tarea se añadirá al final de la fase
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Task name */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Nombre de la tarea *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Entregar manual de marca"
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#0F1629",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
              />
            </div>

            {/* Task type */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Tipo de tarea
              </label>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {(["hito", "info_request", "validation"] as TaskType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTaskType(t)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: "100px",
                      border: `1.5px solid ${taskType === t ? "#0F1629" : "#E2E8F0"}`,
                      background: taskType === t ? "#0F1629" : "white",
                      color: taskType === t ? "white" : "#64748B",
                      fontSize: "12px",
                      fontWeight: 500,
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {TASK_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Owner */}
            <div style={{ display: "flex", gap: "12px" }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  Responsable
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["client", "vambe"] as OwnerType[]).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => handleOwnerTypeChange(o)}
                      style={{
                        flex: 1,
                        padding: "7px 10px",
                        borderRadius: "8px",
                        border: `1.5px solid ${ownerType === o ? (o === "vambe" ? "#4F46E5" : "#3B82F6") : "#E2E8F0"}`,
                        background: ownerType === o ? (o === "vambe" ? "#EDE9FE" : "#DBEAFE") : "white",
                        color: ownerType === o ? (o === "vambe" ? "#4F46E5" : "#1D4ED8") : "#64748B",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {o === "client" ? "Cliente" : "Vambe"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  Etiqueta del responsable
                </label>
                <input
                  type="text"
                  value={ownerLabel}
                  onChange={(e) => setOwnerLabel(e.target.value)}
                  placeholder="NISSAN"
                  style={{
                    width: "100%",
                    padding: "7px 10px",
                    border: "1.5px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "13px",
                    color: "#0F1629",
                    outline: "none",
                    boxSizing: "border-box",
                    textTransform: "uppercase",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                  onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                />
              </div>
            </div>

            {/* Due date */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Fecha límite
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#0F1629",
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
              />
            </div>

            {/* Description */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                Descripción (opcional)
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descripción de la tarea..."
                rows={2}
                style={{
                  width: "100%",
                  padding: "9px 12px",
                  border: "1.5px solid #E2E8F0",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#0F1629",
                  outline: "none",
                  resize: "vertical",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
              />
            </div>

            {/* Validation-specific: doc fields */}
            {taskType === "validation" && (
              <div
                style={{
                  padding: "14px",
                  background: "#F8FAFC",
                  borderRadius: "8px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#4F46E5",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "10px",
                  }}
                >
                  Documento de validación
                </p>
                <div style={{ marginBottom: "8px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    URL del documento
                  </label>
                  <input
                    type="url"
                    value={docUrl}
                    onChange={(e) => setDocUrl(e.target.value)}
                    placeholder="https://..."
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1.5px solid #E2E8F0",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#0F1629",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#4F46E5")}
                    onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "#374151", marginBottom: "4px" }}>
                    Título del documento
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="Nombre del documento..."
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      border: "1.5px solid #E2E8F0",
                      borderRadius: "6px",
                      fontSize: "13px",
                      color: "#0F1629",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#4F46E5")}
                    onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                  />
                </div>
              </div>
            )}

            {/* Info request-specific: questions */}
            {taskType === "info_request" && (
              <div
                style={{
                  padding: "14px",
                  background: "#FFFBEB",
                  borderRadius: "8px",
                  border: "1px solid #FDE68A",
                }}
              >
                <p
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#D97706",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    marginBottom: "10px",
                  }}
                >
                  Preguntas
                </p>
                {questions.map((q, i) => (
                  <div key={i} style={{ marginBottom: "10px" }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                      <div style={{ flex: 1 }}>
                        <input
                          type="text"
                          value={q.question_text}
                          onChange={(e) => updateQuestion(i, "question_text", e.target.value)}
                          placeholder={`Pregunta ${i + 1}`}
                          style={{
                            width: "100%",
                            padding: "7px 10px",
                            border: "1.5px solid #E2E8F0",
                            borderRadius: "6px",
                            fontSize: "13px",
                            color: "#0F1629",
                            outline: "none",
                            boxSizing: "border-box",
                            marginBottom: "4px",
                            transition: "border-color 0.15s",
                          }}
                          onFocus={(e) => (e.target.style.borderColor = "#D97706")}
                          onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                        />
                        <input
                          type="text"
                          value={q.placeholder}
                          onChange={(e) => updateQuestion(i, "placeholder", e.target.value)}
                          placeholder="Placeholder (opcional)"
                          style={{
                            width: "100%",
                            padding: "6px 10px",
                            border: "1.5px solid #E2E8F0",
                            borderRadius: "6px",
                            fontSize: "12px",
                            color: "#64748B",
                            outline: "none",
                            boxSizing: "border-box",
                            transition: "border-color 0.15s",
                          }}
                          onFocus={(e) => (e.target.style.borderColor = "#D97706")}
                          onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                        />
                      </div>
                      {questions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeQuestion(i)}
                          style={{
                            padding: "4px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#94A3B8",
                            marginTop: "6px",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#EF4444")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#94A3B8")}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 2L12 12M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addQuestion}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "5px 10px",
                    border: "1px dashed #D97706",
                    borderRadius: "6px",
                    background: "none",
                    cursor: "pointer",
                    fontSize: "12px",
                    color: "#D97706",
                    fontWeight: 500,
                    marginTop: "4px",
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                  Agregar pregunta
                </button>
              </div>
            )}

            {error && (
              <p
                style={{
                  padding: "10px 12px",
                  background: "#FEF2F2",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#DC2626",
                }}
              >
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", gap: "10px", marginTop: "20px", paddingTop: "16px", borderTop: "1px solid #E2E8F0" }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "8px",
                border: "1.5px solid #E2E8F0",
                background: "white",
                color: "#64748B",
                fontSize: "14px",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 1,
                padding: "11px",
                borderRadius: "8px",
                border: "none",
                background: saving ? "#4B5563" : "#0F1629",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Creando..." : "Crear tarea"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
