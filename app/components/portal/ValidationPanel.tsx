"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ClientTask, TaskValidation } from "@/lib/types";
import { useToast } from "./Toast";

interface ValidationPanelProps {
  task: ClientTask & { validation?: TaskValidation };
  onClose: () => void;
  onSaved?: () => void;
  isAdmin?: boolean;
}

export default function ValidationPanel({ task, onClose, onSaved, isAdmin }: ValidationPanelProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingDoc, setSavingDoc] = useState(false);
  const validation = task.validation;
  const isValidated = validation?.validated ?? false;

  const [editDocUrl, setEditDocUrl] = useState(validation?.doc_url ?? "");
  const [editDocTitle, setEditDocTitle] = useState(validation?.doc_title ?? "");

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 350);
  };

  const handleSaveDoc = async () => {
    if (!validation) return;
    setSavingDoc(true);
    const { error } = await supabase
      .from("task_validations")
      .update({
        doc_url: editDocUrl.trim() || null,
        doc_title: editDocTitle.trim() || null,
      })
      .eq("id", validation.id);
    setSavingDoc(false);
    if (error) {
      showToast("Error al guardar el documento.", "error");
    } else {
      showToast("Documento guardado.");
      onSaved?.();
    }
  };

  const handleValidate = async () => {
    if (!validation) return;
    setSaving(true);

    const now = new Date().toISOString();

    const { error: validationError } = await supabase
      .from("task_validations")
      .update({ validated: true, validated_at: now })
      .eq("id", validation.id);

    if (validationError) {
      showToast("Error al validar. Intenta de nuevo.", "error");
      setSaving(false);
      return;
    }

    const { error: taskError } = await supabase
      .from("client_tasks")
      .update({
        progress: 100,
        status: "completed",
        completed_at: now,
        completed_by: "client",
      })
      .eq("id", task.id);

    if (taskError) {
      showToast("Error al actualizar la tarea.", "error");
      setSaving(false);
      return;
    }

    setSaving(false);
    showToast("Documento validado correctamente.");
    onSaved?.();
    handleClose();
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
                color: "#4F46E5",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                marginBottom: "4px",
              }}
            >
              {isAdmin ? "Validación (Admin)" : "En validación"}
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
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>

          {/* Admin: editable doc fields */}
          {isAdmin && validation && (
            <div
              style={{
                padding: "16px",
                background: "#F8FAFC",
                borderRadius: "10px",
                border: "1px solid #E2E8F0",
                marginBottom: "20px",
              }}
            >
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#4F46E5",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "12px",
                }}
              >
                Configurar documento
              </p>
              <div style={{ marginBottom: "10px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "4px",
                  }}
                >
                  URL del documento
                </label>
                <input
                  type="url"
                  value={editDocUrl}
                  onChange={(e) => setEditDocUrl(e.target.value)}
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
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#374151",
                    marginBottom: "4px",
                  }}
                >
                  Título del documento
                </label>
                <input
                  type="text"
                  value={editDocTitle}
                  onChange={(e) => setEditDocTitle(e.target.value)}
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
              <button
                onClick={handleSaveDoc}
                disabled={savingDoc}
                style={{
                  padding: "8px 16px",
                  borderRadius: "6px",
                  background: savingDoc ? "#4B5563" : "#4F46E5",
                  border: "none",
                  color: "white",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: savingDoc ? "not-allowed" : "pointer",
                  transition: "background 0.15s",
                }}
              >
                {savingDoc ? "Guardando..." : "Guardar documento"}
              </button>
            </div>
          )}

          {/* Status badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 14px",
              borderRadius: "100px",
              marginBottom: "24px",
              background: isValidated ? "#DCFCE7" : "#EEF2FF",
              color: isValidated ? "#059669" : "#4F46E5",
            }}
          >
            {isValidated ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7L5.5 10.5L12 4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div
                className="animate-pulse"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#4F46E5",
                }}
              />
            )}
            <span style={{ fontSize: "12px", fontWeight: 700 }}>
              {isValidated ? "Validado" : "Pendiente de validación"}
            </span>
          </div>

          {!validation ? (
            <div
              style={{
                padding: "20px",
                background: "#F8FAFC",
                borderRadius: "10px",
                textAlign: "center",
              }}
            >
              <p style={{ fontSize: "13px", color: "#64748B" }}>
                {isAdmin
                  ? "Completa los campos de documento arriba para configurar esta validación."
                  : "El equipo de Vambe está preparando los materiales para esta validación."}
              </p>
            </div>
          ) : (
            <>
              {(validation.doc_url || validation.doc_title) && (
                <div style={{ marginBottom: "20px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#94A3B8",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "8px",
                    }}
                  >
                    Documento de referencia
                  </p>
                  {validation.doc_url ? (
                    <a
                      href={validation.doc_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "12px 14px",
                        border: "1.5px solid #E2E8F0",
                        borderRadius: "8px",
                        textDecoration: "none",
                        color: "#0F1629",
                        background: "white",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.borderColor = "#3B82F6")
                      }
                      onMouseLeave={(e) =>
                        ((e.currentTarget as HTMLAnchorElement).style.borderColor = "#E2E8F0")
                      }
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "6px",
                          background: "#EEF2FF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                          <path
                            d="M3 2h7l4 4v8H3V2z"
                            stroke="#4F46E5"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 2v4h4"
                            stroke="#4F46E5"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      <span
                        style={{
                          flex: 1,
                          fontSize: "13px",
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {validation.doc_title ?? "Ver documento"}
                      </span>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        fill="none"
                        style={{ color: "#94A3B8", flexShrink: 0 }}
                      >
                        <path
                          d="M3 11L11 3M11 3H6M11 3v5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </a>
                  ) : (
                    <p style={{ fontSize: "13px", color: "#0F1629", fontWeight: 500 }}>
                      {validation.doc_title}
                    </p>
                  )}
                </div>
              )}

              {validation.comments && (
                <div style={{ marginBottom: "20px" }}>
                  <p
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#94A3B8",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: "8px",
                    }}
                  >
                    Comentarios del equipo
                  </p>
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
                        fontSize: "13px",
                        color: "#0F1629",
                        lineHeight: "1.6",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {validation.comments}
                    </p>
                  </div>
                </div>
              )}

              {isValidated && validation.validated_at && (
                <div
                  style={{
                    padding: "12px 14px",
                    background: "#DCFCE7",
                    borderRadius: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8L6.5 11.5L13 5"
                      stroke="#059669"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span style={{ fontSize: "12px", color: "#059669", fontWeight: 600 }}>
                    Validado el{" "}
                    {new Date(validation.validated_at).toLocaleDateString("es-MX", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {validation && (
          <div style={{ padding: "16px 24px", borderTop: "1px solid #E2E8F0" }}>
            <button
              onClick={handleValidate}
              disabled={isValidated || saving}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "8px",
                background: isValidated ? "#F1F5F9" : saving ? "#4B5563" : "#0F1629",
                border: isValidated ? "1.5px solid #E2E8F0" : "none",
                color: isValidated ? "#94A3B8" : "white",
                fontSize: "14px",
                fontWeight: 600,
                cursor: isValidated || saving ? "not-allowed" : "pointer",
                transition: "background 0.15s",
              }}
            >
              {saving
                ? "Validando..."
                : isValidated
                ? "Ya validado"
                : "Validar documento"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
