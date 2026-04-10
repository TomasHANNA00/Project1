"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientTask, TaskFile, TaskQuestion, TaskResponse } from "@/lib/types";
import { useToast } from "./Toast";

interface InfoRequestPanelProps {
  task: ClientTask;
  onClose: () => void;
  onSaved: () => void;
}

export default function InfoRequestPanel({ task, onClose, onSaved }: InfoRequestPanelProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<TaskQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [existingResponses, setExistingResponses] = useState<Map<string, TaskResponse>>(new Map());
  const [files, setFiles] = useState<Record<string, TaskFile[]>>({});
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    loadData();
  }, []);

  const loadData = async () => {
    const { data: questionsData } = await supabase
      .from("task_questions")
      .select("*")
      .eq("task_id", task.id)
      .order("sort_order");

    const qs = questionsData ?? [];
    setQuestions(qs);

    if (qs.length > 0) {
      const qIds = qs.map((q) => q.id);

      const { data: responsesData } = await supabase
        .from("task_responses")
        .select("*")
        .in("question_id", qIds)
        .eq("client_id", user!.id);

      const rMap = new Map((responsesData ?? []).map((r) => [r.question_id, r]));
      setExistingResponses(rMap);
      const rText: Record<string, string> = {};
      for (const r of responsesData ?? []) {
        rText[r.question_id] = r.text_content ?? "";
      }
      setResponses(rText);

      const { data: filesData } = await supabase
        .from("task_files")
        .select("*")
        .in("question_id", qIds)
        .eq("client_id", user!.id);

      const fMap: Record<string, TaskFile[]> = {};
      for (const f of filesData ?? []) {
        if (!fMap[f.question_id]) fMap[f.question_id] = [];
        fMap[f.question_id].push(f);
      }
      setFiles(fMap);
    }

    setLoading(false);
  };

  // Calculate filled count and update client_tasks progress
  const updateTaskProgress = async (
    currentFiles: Record<string, TaskFile[]>,
    currentResponses: Record<string, string>,
    currentQuestions: TaskQuestion[]
  ) => {
    let filledCount = 0;
    for (const q of currentQuestions) {
      const hasText = (currentResponses[q.id] ?? "").trim().length > 0;
      const hasFiles = (currentFiles[q.id] ?? []).length > 0;
      if (hasText || hasFiles) filledCount++;
    }

    const newProgress =
      currentQuestions.length > 0
        ? Math.round((filledCount / currentQuestions.length) * 100)
        : 0;

    let newStatus: string;
    if (newProgress === 100) {
      newStatus = "completed";
    } else if (newProgress > 0) {
      newStatus = "in_progress";
    } else {
      newStatus = task.status;
    }

    const now = new Date().toISOString();
    const taskUpdate: Record<string, unknown> = {
      progress: newProgress,
      status: newStatus,
      ...(newProgress === 100
        ? { completed_at: now, completed_by: user!.id }
        : { completed_at: null, completed_by: null }),
    };

    return supabase.from("client_tasks").update(taskUpdate).eq("id", task.id);
  };

  const handleSave = async () => {
    setSaving(true);
    let hasError = false;

    // 1. Upsert each response
    for (const q of questions) {
      const text = responses[q.id] ?? "";
      const existing = existingResponses.get(q.id);

      if (existing) {
        const { error } = await supabase
          .from("task_responses")
          .update({ text_content: text, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) { hasError = true; break; }
      } else if (text.trim()) {
        const { error } = await supabase
          .from("task_responses")
          .insert({ question_id: q.id, client_id: user!.id, text_content: text });
        if (error) { hasError = true; break; }
      }
    }

    // 2. Calculate and update client_tasks progress
    if (!hasError) {
      const { error: taskError } = await updateTaskProgress(files, responses, questions);
      if (taskError) hasError = true;
    }

    setSaving(false);
    if (hasError) {
      showToast("Error al guardar. Intenta de nuevo.", "error");
    } else {
      showToast("Respuestas guardadas correctamente.");
      onSaved();
      handleClose();
    }
  };

  const handleFileUpload = async (questionId: string, file: File) => {
    // Path: {clientId}/{questionId}/{timestamp}_{filename}
    const path = `${user!.id}/${questionId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(path, file);
    if (uploadError) { showToast("Error al subir el archivo.", "error"); return; }

    const { error: dbError } = await supabase.from("task_files").insert({
      question_id: questionId,
      client_id: user!.id,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    });
    if (dbError) { showToast("Error al registrar el archivo.", "error"); return; }

    // Fetch updated file list for this question
    const { data: newFilesData } = await supabase
      .from("task_files")
      .select("*")
      .eq("question_id", questionId)
      .eq("client_id", user!.id);

    const updatedFiles = { ...files, [questionId]: newFilesData ?? [] };
    setFiles(updatedFiles);

    // Update progress (a file counts as "filled")
    await updateTaskProgress(updatedFiles, responses, questions);

    showToast(`"${file.name}" subido correctamente.`);
    onSaved();
  };

  const handleFileDelete = async (questionId: string, file: TaskFile) => {
    if (!confirm(`¿Eliminar "${file.file_name}"?`)) return;

    const { error: storageError } = await supabase.storage
      .from("submissions")
      .remove([file.file_path]);
    if (storageError) { showToast("Error al eliminar el archivo.", "error"); return; }

    const { error: dbError } = await supabase
      .from("task_files")
      .delete()
      .eq("id", file.id);
    if (dbError) { showToast("Error al eliminar el registro.", "error"); return; }

    const updatedFiles = {
      ...files,
      [questionId]: (files[questionId] ?? []).filter((f) => f.id !== file.id),
    };
    setFiles(updatedFiles);

    await updateTaskProgress(updatedFiles, responses, questions);

    showToast(`"${file.file_name}" eliminado.`);
    onSaved();
  };

  const handleFileDownload = async (file: TaskFile) => {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(file.file_path, 60);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    } else {
      showToast("No se pudo generar el enlace de descarga.", "error");
    }
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 350);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,22,41,0.4)",
          zIndex: 50,
          opacity: visible ? 1 : 0,
          transition: "opacity 0.35s ease",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "480px",
          maxWidth: "100vw",
          background: "white",
          zIndex: 51,
          display: "flex",
          flexDirection: "column",
          transform: visible ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.35s ease",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid #E2E8F0",
            display: "flex",
            alignItems: "flex-start",
            gap: "12px",
          }}
        >
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: "11px",
                fontWeight: 600,
                color: "#F59E0B",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "4px",
              }}
            >
              Información requerida
            </p>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0F1629" }}>
              {task.name}
            </p>
            {task.description && (
              <p
                style={{
                  marginTop: "6px",
                  fontSize: "13px",
                  color: "#64748B",
                  lineHeight: "1.5",
                }}
              >
                {task.description}
              </p>
            )}
          </div>
          <button
            onClick={handleClose}
            style={{
              padding: "4px",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#94A3B8",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 4L16 16M16 4L4 16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                paddingTop: "40px",
              }}
            >
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : questions.length === 0 ? (
            <p style={{ fontSize: "13px", color: "#94A3B8" }}>
              No hay preguntas configuradas para esta tarea.
            </p>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} style={{ marginBottom: "28px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "#0F1629",
                    marginBottom: "8px",
                  }}
                >
                  {i + 1}. {q.question_text}
                </label>
                <textarea
                  value={responses[q.id] ?? ""}
                  onChange={(e) =>
                    setResponses((prev) => ({ ...prev, [q.id]: e.target.value }))
                  }
                  placeholder={q.placeholder ?? "Escribe tu respuesta aquí..."}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    border: "1.5px solid #E2E8F0",
                    borderRadius: "8px",
                    fontSize: "13px",
                    color: "#0F1629",
                    resize: "vertical",
                    outline: "none",
                    fontFamily: "inherit",
                    boxSizing: "border-box",
                    transition: "border-color 0.15s",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                  onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                />

                {/* Existing files */}
                {(files[q.id] ?? []).length > 0 && (
                  <div style={{ marginTop: "8px" }}>
                    {(files[q.id] ?? []).map((f) => (
                      <div
                        key={f.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          padding: "6px 10px",
                          background: "#F8FAFC",
                          borderRadius: "6px",
                          marginBottom: "4px",
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 14 14"
                          fill="none"
                          style={{ color: "#64748B", flexShrink: 0 }}
                        >
                          <path
                            d="M2 1h7l3 3v9H2V1z"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M9 1v3h3"
                            stroke="currentColor"
                            strokeWidth="1.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        <button
                          onClick={() => handleFileDownload(f)}
                          title="Descargar archivo"
                          style={{
                            flex: 1,
                            fontSize: "12px",
                            color: "#3B82F6",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 0,
                            fontFamily: "inherit",
                            textDecoration: "underline",
                          }}
                        >
                          {f.file_name}
                        </button>
                        <span
                          style={{
                            fontSize: "11px",
                            color: "#94A3B8",
                            flexShrink: 0,
                          }}
                        >
                          {f.file_size
                            ? `${(f.file_size / 1024).toFixed(0)} KB`
                            : ""}
                        </span>
                        <button
                          onClick={() => handleFileDelete(q.id, f)}
                          title="Eliminar archivo"
                          style={{
                            padding: "2px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#94A3B8",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.color = "#EF4444")
                          }
                          onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.color = "#94A3B8")
                          }
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path
                              d="M2 2L10 10M10 2L2 10"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* File upload */}
                <div style={{ marginTop: "8px" }}>
                  <input
                    type="file"
                    ref={(el) => {
                      if (el) fileInputRefs.current.set(q.id, el);
                    }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(q.id, f);
                      e.target.value = "";
                    }}
                    style={{ display: "none" }}
                  />
                  <button
                    onClick={() => fileInputRefs.current.get(q.id)?.click()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "6px 12px",
                      border: "1.5px dashed #CBD5E1",
                      borderRadius: "6px",
                      background: "none",
                      cursor: "pointer",
                      fontSize: "12px",
                      color: "#64748B",
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M7 2v10M2 7h10"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    Adjuntar archivo
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {!loading && questions.length > 0 && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #E2E8F0",
              display: "flex",
              gap: "10px",
            }}
          >
            <button
              onClick={handleClose}
              disabled={saving}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                background: "white",
                border: "1.5px solid #E2E8F0",
                color: "#64748B",
                fontSize: "14px",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!saving)
                  (e.currentTarget as HTMLButtonElement).style.borderColor = "#94A3B8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = "#E2E8F0";
              }}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                flex: 1,
                padding: "12px",
                borderRadius: "8px",
                background: saving ? "#4B5563" : "#0F1629",
                border: "none",
                color: "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving ? "Guardando..." : "Guardar respuestas"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
