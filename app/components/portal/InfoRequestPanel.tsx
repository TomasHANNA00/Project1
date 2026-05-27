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
  isAdmin?: boolean;
  /** Client's user ID — required when isAdmin=true so responses are attributed correctly */
  clientId?: string;
}

export default function InfoRequestPanel({ task, onClose, onSaved, isAdmin, clientId }: InfoRequestPanelProps) {
  const { user } = useAuth();
  const { showToast } = useToast();

  // The ID used as client_id in all DB queries (client's id, not admin's)
  const effectiveClientId = clientId ?? user!.id;

  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [questions, setQuestions] = useState<TaskQuestion[]>([]);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [existingResponses, setExistingResponses] = useState<Map<string, TaskResponse>>(new Map());
  const [files, setFiles] = useState<Record<string, TaskFile[]>>({});
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // General response (Feature 2)
  const [generalResponse, setGeneralResponse] = useState(task.general_response ?? "");

  // Admin: description editing
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(task.description ?? "");
  const [savingDescription, setSavingDescription] = useState(false);

  // Admin: question editing
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingQuestionText, setEditingQuestionText] = useState("");

  // Admin: add new question
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionPlaceholder, setNewQuestionPlaceholder] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);

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

      let responsesQuery = supabase
        .from("task_responses")
        .select("*")
        .in("question_id", qIds);
      if (!isAdmin) responsesQuery = responsesQuery.eq("client_id", effectiveClientId);

      const { data: responsesData } = await responsesQuery;

      const rMap = new Map((responsesData ?? []).map((r) => [r.question_id, r]));
      setExistingResponses(rMap);
      const rText: Record<string, string> = {};
      for (const r of responsesData ?? []) {
        rText[r.question_id] = r.text_content ?? "";
      }
      setResponses(rText);

      let filesQuery = supabase
        .from("task_files")
        .select("*")
        .in("question_id", qIds);
      if (!isAdmin) filesQuery = filesQuery.eq("client_id", effectiveClientId);

      const { data: filesData } = await filesQuery;

      const fMap: Record<string, TaskFile[]> = {};
      for (const f of filesData ?? []) {
        if (!fMap[f.question_id]) fMap[f.question_id] = [];
        fMap[f.question_id].push(f);
      }
      setFiles(fMap);
    }

    setLoading(false);
  };

  // Calculate progress and update client_tasks
  const updateTaskProgress = async (
    currentFiles: Record<string, TaskFile[]>,
    currentResponses: Record<string, string>,
    currentQuestions: TaskQuestion[],
    currentGeneralResponse: string
  ): Promise<{ error: unknown }> => {
    let newProgress: number;

    // If there's a general response, the task is fully answered
    if (currentGeneralResponse.trim()) {
      newProgress = 100;
    } else {
      let filledCount = 0;
      for (const q of currentQuestions) {
        const hasText = (currentResponses[q.id] ?? "").trim().length > 0;
        const hasFiles = (currentFiles[q.id] ?? []).length > 0;
        if (hasText || hasFiles) filledCount++;
      }
      newProgress =
        currentQuestions.length > 0
          ? Math.round((filledCount / currentQuestions.length) * 100)
          : 0;
    }

    const newStatus =
      newProgress === 100 ? "completed" : newProgress > 0 ? "in_progress" : task.status;

    const now = new Date().toISOString();
    const taskUpdate: Record<string, unknown> = {
      progress: newProgress,
      status: newStatus,
      ...(newProgress === 100
        ? { completed_at: now, completed_by: "client" }
        : { completed_at: null, completed_by: null }),
    };

    const { error } = await supabase
      .from("client_tasks")
      .update(taskUpdate)
      .eq("id", task.id);

    return { error };
  };

  const handleSave = async () => {
    setSaving(true);
    let lastError: { code?: string; message?: string } | null = null;

    try {
      const now = new Date().toISOString();

      // Save per-question responses
      for (const q of questions) {
        const text = responses[q.id] ?? "";
        const existing = existingResponses.get(q.id);
        if (!existing && !text.trim()) continue;

        const { error } = await supabase
          .from("task_responses")
          .upsert(
            {
              question_id: q.id,
              client_id: effectiveClientId,
              text_content: text,
              updated_at: now,
            },
            { onConflict: "question_id,client_id" }
          );
        if (error) {
          lastError = error;
          break;
        }
      }

      if (!lastError) {
        // Save general_response to client_tasks
        const { error: grError } = await supabase
          .from("client_tasks")
          .update({ general_response: generalResponse.trim() || null })
          .eq("id", task.id);
        if (grError) lastError = grError as { code?: string; message?: string };
      }

      if (!lastError) {
        const { error: taskError } = await updateTaskProgress(files, responses, questions, generalResponse);
        if (taskError) lastError = taskError as { code?: string; message?: string };
      }
    } catch (err) {
      lastError = { message: String(err) };
    }

    setSaving(false);
    if (lastError) {
      const detail = lastError.code
        ? `${lastError.code}: ${lastError.message}`
        : lastError.message ?? "Error desconocido";
      showToast(`Error al guardar — ${detail}`, "error");
    } else {
      showToast("Respuestas guardadas correctamente.");
      onSaved();
      handleClose();
    }
  };

  const handleFileUpload = async (questionId: string, file: File) => {
    const path = `${effectiveClientId}/${questionId}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(path, file);
    if (uploadError) { showToast("Error al subir el archivo.", "error"); return; }

    const { error: dbError } = await supabase.from("task_files").insert({
      question_id: questionId,
      client_id: effectiveClientId,
      file_name: file.name,
      file_path: path,
      file_size: file.size,
      mime_type: file.type,
    });
    if (dbError) { showToast("Error al registrar el archivo.", "error"); return; }

    const { data: newFilesData } = await supabase
      .from("task_files")
      .select("*")
      .eq("question_id", questionId)
      .eq("client_id", effectiveClientId);

    const updatedFiles = { ...files, [questionId]: newFilesData ?? [] };
    setFiles(updatedFiles);
    await updateTaskProgress(updatedFiles, responses, questions, generalResponse);
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
    await updateTaskProgress(updatedFiles, responses, questions, generalResponse);
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

  // Admin: save description
  const handleSaveDescription = async () => {
    setSavingDescription(true);
    const { error } = await supabase
      .from("client_tasks")
      .update({ description: descriptionValue.trim() || null })
      .eq("id", task.id);
    setSavingDescription(false);
    if (error) {
      showToast("Error al guardar la descripción.", "error");
    } else {
      showToast("Descripción actualizada.");
      setEditingDescription(false);
      onSaved();
    }
  };

  // Admin: save question text inline
  const handleSaveQuestionText = async (questionId: string, text: string) => {
    const trimmed = text.trim();
    const original = questions.find((q) => q.id === questionId)?.question_text ?? "";
    setEditingQuestionId(null);
    if (!trimmed || trimmed === original) return;

    const { error } = await supabase
      .from("task_questions")
      .update({ question_text: trimmed })
      .eq("id", questionId);
    if (error) {
      showToast("Error al guardar la pregunta.", "error");
    } else {
      setQuestions((prev) => prev.map((q) => q.id === questionId ? { ...q, question_text: trimmed } : q));
      onSaved();
    }
  };

  // Admin: delete question with cascade
  const handleDeleteQuestion = async (questionId: string, questionText: string) => {
    if (!confirm(`¿Eliminar la pregunta "${questionText}"? Se eliminarán también todas las respuestas y archivos asociados.`)) return;

    const { data: filesToDelete } = await supabase
      .from("task_files")
      .select("file_path")
      .eq("question_id", questionId);

    if (filesToDelete && filesToDelete.length > 0) {
      await supabase.storage
        .from("submissions")
        .remove(filesToDelete.map((f) => f.file_path));
    }

    await supabase.from("task_files").delete().eq("question_id", questionId);
    await supabase.from("task_responses").delete().eq("question_id", questionId);

    const { error } = await supabase.from("task_questions").delete().eq("id", questionId);
    if (error) {
      showToast("Error al eliminar la pregunta.", "error");
      return;
    }

    setQuestions((prev) => prev.filter((q) => q.id !== questionId));
    showToast("Pregunta eliminada.");
    onSaved();
  };

  // Admin: add new question
  const handleAddQuestion = async () => {
    const trimmed = newQuestionText.trim();
    if (!trimmed) return;
    setAddingQuestion(true);

    const maxOrder = questions.reduce((m, q) => Math.max(m, q.sort_order ?? 0), 0);
    const { data, error } = await supabase
      .from("task_questions")
      .insert({
        task_id: task.id,
        question_text: trimmed,
        placeholder: newQuestionPlaceholder.trim() || null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();

    setAddingQuestion(false);
    if (error || !data) {
      showToast("Error al agregar la pregunta.", "error");
      return;
    }

    setQuestions((prev) => [...prev, data]);
    setNewQuestionText("");
    setNewQuestionPlaceholder("");
    setShowAddQuestion(false);
    showToast("Pregunta agregada.");
    onSaved();
  };

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 350);
  };

  // ── Question response row (shared between admin and client) ──────
  const renderQuestionRow = (q: TaskQuestion, i: number) => (
    <div key={q.id} style={{ marginBottom: "24px" }}>
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
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: "#64748B", flexShrink: 0 }}>
                <path d="M2 1h7l3 3v9H2V1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                <path d="M9 1v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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
              <span style={{ fontSize: "11px", color: "#94A3B8", flexShrink: 0 }}>
                {f.file_size ? `${(f.file_size / 1024).toFixed(0)} KB` : ""}
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
                onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#EF4444")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#94A3B8")}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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
          ref={(el) => { if (el) fileInputRefs.current.set(q.id, el); }}
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
            <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Adjuntar archivo
        </button>
      </div>
    </div>
  );

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
                color: isAdmin ? "#4F46E5" : "#F59E0B",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "4px",
              }}
            >
              {isAdmin ? "Info Request (Admin)" : "Información requerida"}
            </p>
            <p style={{ fontSize: "16px", fontWeight: 700, color: "#0F1629" }}>
              {task.name}
            </p>

            {/* Description — editable when isAdmin */}
            {isAdmin ? (
              editingDescription ? (
                <div style={{ marginTop: "8px" }}>
                  <textarea
                    value={descriptionValue}
                    autoFocus
                    onChange={(e) => setDescriptionValue(e.target.value)}
                    rows={3}
                    style={{
                      width: "100%",
                      fontSize: "13px",
                      color: "#64748B",
                      lineHeight: "1.5",
                      border: "1px solid #3B82F6",
                      borderRadius: "6px",
                      padding: "6px 8px",
                      outline: "none",
                      resize: "vertical",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      background: "#F0F9FF",
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setDescriptionValue(task.description ?? "");
                        setEditingDescription(false);
                      }
                    }}
                  />
                  <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                    <button
                      onClick={() => { setDescriptionValue(task.description ?? ""); setEditingDescription(false); }}
                      style={{ padding: "4px 10px", borderRadius: "6px", border: "1px solid #E2E8F0", background: "white", fontSize: "12px", color: "#64748B", cursor: "pointer" }}
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveDescription}
                      disabled={savingDescription}
                      style={{ padding: "4px 10px", borderRadius: "6px", border: "none", background: "#4F46E5", fontSize: "12px", fontWeight: 600, color: "white", cursor: savingDescription ? "not-allowed" : "pointer" }}
                    >
                      {savingDescription ? "Guardando..." : "Guardar"}
                    </button>
                  </div>
                </div>
              ) : (
                <p
                  onClick={() => setEditingDescription(true)}
                  title="Clic para editar descripción"
                  style={{
                    marginTop: "6px",
                    fontSize: "13px",
                    color: descriptionValue ? "#64748B" : "#CBD5E1",
                    lineHeight: "1.5",
                    cursor: "text",
                    padding: "4px 6px",
                    borderRadius: "4px",
                    border: "1px dashed transparent",
                    transition: "border-color 0.15s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#CBD5E1")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
                >
                  {descriptionValue || "Agregar descripción..."}
                </p>
              )
            ) : (
              task.description && (
                <p style={{ marginTop: "6px", fontSize: "13px", color: "#64748B", lineHeight: "1.5" }}>
                  {task.description}
                </p>
              )
            )}
          </div>
          <button
            onClick={handleClose}
            style={{ padding: "4px", background: "none", border: "none", cursor: "pointer", color: "#94A3B8", flexShrink: 0 }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", paddingTop: "40px" }}>
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            </div>
          ) : questions.length === 0 && !isAdmin ? (
            <p style={{ fontSize: "13px", color: "#94A3B8" }}>
              No hay preguntas configuradas para esta tarea.
            </p>
          ) : (
            <div>
              {/* ── Feature 2: General Response (2+ questions only) ── */}
              {questions.length >= 2 && (
                <div
                  style={{
                    padding: "16px",
                    background: "#FFFBEB",
                    borderRadius: "10px",
                    border: "1.5px solid #FDE68A",
                    marginBottom: "24px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <rect x="1" y="2" width="12" height="10" rx="1.5" stroke="#D97706" strokeWidth="1.3" />
                      <path d="M4 5h6M4 7.5h4" stroke="#D97706" strokeWidth="1.3" strokeLinecap="round" />
                    </svg>
                    <p style={{ fontSize: "12px", fontWeight: 700, color: "#92400E" }}>
                      Respuesta general
                    </p>
                    {generalResponse.trim() && (
                      <span style={{ fontSize: "10px", fontWeight: 600, color: "#059669", background: "#DCFCE7", borderRadius: "100px", padding: "1px 7px" }}>
                        Guardada
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: "12px", color: "#92400E", marginBottom: "10px", lineHeight: "1.5" }}>
                    Si tienes un documento o texto que responde todas las preguntas de esta sección, escríbelo aquí.
                  </p>
                  <textarea
                    value={generalResponse}
                    onChange={(e) => setGeneralResponse(e.target.value)}
                    placeholder="Pega aquí tu respuesta completa o resumen que cubre todas las preguntas..."
                    rows={5}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      border: "1.5px solid #FDE68A",
                      borderRadius: "8px",
                      fontSize: "13px",
                      color: "#0F1629",
                      resize: "vertical",
                      outline: "none",
                      fontFamily: "inherit",
                      boxSizing: "border-box",
                      background: "white",
                      transition: "border-color 0.15s",
                    }}
                    onFocus={(e) => (e.target.style.borderColor = "#D97706")}
                    onBlur={(e) => (e.target.style.borderColor = "#FDE68A")}
                  />
                </div>
              )}

              {/* ── Per-question responses ── */}
              {questions.length > 0 && (
                <>
                  {questions.length >= 2 && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        marginBottom: "20px",
                      }}
                    >
                      <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
                      <span style={{ fontSize: "11px", color: "#94A3B8", whiteSpace: "nowrap" }}>
                        o responde cada pregunta por separado
                      </span>
                      <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
                    </div>
                  )}
                  {questions.map((q, i) => renderQuestionRow(q, i))}
                </>
              )}

              {/* ── Admin-only: question management ── */}
              {isAdmin && (
                <div style={{ marginTop: questions.length > 0 ? "28px" : "0" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      marginBottom: "16px",
                    }}
                  >
                    <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>
                      Gestión de preguntas
                    </span>
                    <div style={{ flex: 1, height: "1px", background: "#E2E8F0" }} />
                  </div>

                  {questions.length === 0 ? (
                    <p style={{ fontSize: "13px", color: "#94A3B8", marginBottom: "12px" }}>
                      No hay preguntas. Agrega la primera a continuación.
                    </p>
                  ) : (
                    questions.map((q, i) => (
                      <div
                        key={q.id}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: "10px",
                          padding: "10px 12px",
                          marginBottom: "8px",
                          background: "#F8FAFC",
                          borderRadius: "8px",
                          border: "1px solid #E2E8F0",
                        }}
                      >
                        <span style={{ fontSize: "12px", fontWeight: 600, color: "#94A3B8", flexShrink: 0, marginTop: "2px" }}>
                          {i + 1}.
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {editingQuestionId === q.id ? (
                            <input
                              type="text"
                              defaultValue={q.question_text}
                              autoFocus
                              onBlur={(e) => handleSaveQuestionText(q.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") {
                                  setEditingQuestionId(null);
                                  setEditingQuestionText("");
                                }
                              }}
                              style={{
                                width: "100%",
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "#0F1629",
                                border: "1px solid #3B82F6",
                                borderRadius: "4px",
                                padding: "3px 6px",
                                outline: "none",
                                fontFamily: "inherit",
                                background: "#F0F9FF",
                                boxSizing: "border-box",
                              }}
                            />
                          ) : (
                            <p
                              onClick={() => {
                                setEditingQuestionId(q.id);
                                setEditingQuestionText(q.question_text);
                              }}
                              title="Clic para editar"
                              style={{
                                fontSize: "13px",
                                fontWeight: 500,
                                color: "#0F1629",
                                cursor: "text",
                                padding: "2px 4px",
                                borderRadius: "4px",
                                border: "1px dashed transparent",
                                transition: "border-color 0.15s",
                                margin: 0,
                                wordBreak: "break-word",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#CBD5E1")}
                              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "transparent")}
                            >
                              {q.question_text}
                            </p>
                          )}
                          {q.placeholder && (
                            <p style={{ fontSize: "11px", color: "#94A3B8", marginTop: "2px", marginBottom: 0 }}>
                              Placeholder: {q.placeholder}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteQuestion(q.id, q.question_text)}
                          title="Eliminar pregunta"
                          style={{
                            padding: "4px",
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#CBD5E1",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#EF4444")}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1")}
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M2 3.5h10M5.5 3.5V2h3v1.5M4 3.5l.7 7.5h4.6l.7-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </div>
                    ))
                  )}

                  {/* Add question */}
                  {showAddQuestion ? (
                    <div
                      style={{
                        padding: "14px",
                        background: "#F0F9FF",
                        borderRadius: "8px",
                        border: "1.5px solid #3B82F6",
                        marginTop: "8px",
                      }}
                    >
                      <p style={{ fontSize: "12px", fontWeight: 600, color: "#1D4ED8", marginBottom: "10px" }}>
                        Nueva pregunta
                      </p>
                      <input
                        type="text"
                        value={newQuestionText}
                        onChange={(e) => setNewQuestionText(e.target.value)}
                        placeholder="Texto de la pregunta..."
                        autoFocus
                        style={{
                          width: "100%",
                          fontSize: "13px",
                          padding: "7px 10px",
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
                      <input
                        type="text"
                        value={newQuestionPlaceholder}
                        onChange={(e) => setNewQuestionPlaceholder(e.target.value)}
                        placeholder="Placeholder (opcional)..."
                        style={{
                          width: "100%",
                          fontSize: "13px",
                          padding: "7px 10px",
                          border: "1.5px solid #E2E8F0",
                          borderRadius: "6px",
                          outline: "none",
                          fontFamily: "inherit",
                          boxSizing: "border-box",
                          marginBottom: "10px",
                        }}
                        onFocus={(e) => (e.target.style.borderColor = "#3B82F6")}
                        onBlur={(e) => (e.target.style.borderColor = "#E2E8F0")}
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          onClick={() => { setShowAddQuestion(false); setNewQuestionText(""); setNewQuestionPlaceholder(""); }}
                          style={{ flex: 1, padding: "8px", borderRadius: "6px", border: "1px solid #E2E8F0", background: "white", fontSize: "12px", color: "#64748B", cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleAddQuestion}
                          disabled={!newQuestionText.trim() || addingQuestion}
                          style={{
                            flex: 1,
                            padding: "8px",
                            borderRadius: "6px",
                            border: "none",
                            background: !newQuestionText.trim() || addingQuestion ? "#4B5563" : "#3B82F6",
                            fontSize: "12px",
                            fontWeight: 600,
                            color: "white",
                            cursor: !newQuestionText.trim() || addingQuestion ? "not-allowed" : "pointer",
                          }}
                        >
                          {addingQuestion ? "Agregando..." : "Agregar"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowAddQuestion(true)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "8px 14px",
                        border: "1.5px dashed #CBD5E1",
                        borderRadius: "8px",
                        background: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 500,
                        color: "#64748B",
                        marginTop: "8px",
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
                      Agregar pregunta
                    </button>
                  )}
                </div>
              )}
            </div>
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
                if (!saving) (e.currentTarget as HTMLButtonElement).style.borderColor = "#94A3B8";
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
