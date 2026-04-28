"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { createProjectFromTemplate } from "@/lib/createProject";
import type { ProjectTemplate, TaskType, OwnerType } from "@/lib/types";

// ── Types ─────────────────────────────────────────────────────────

interface TemplateWithMeta extends ProjectTemplate {
  phase_count: number;
  task_count: number;
}

interface PhaseTaskPreview {
  id: string;
  name: string;
  phase_number: number;
  tasks: { id: string; name: string; task_type: TaskType; owner_type: OwnerType }[];
}

interface InviteForm {
  email: string;
  full_name: string;
  company_name: string;
  owner_label: string;
  role: "client" | "admin";
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  accessToken: string | null;
}

// ── Constants ────────────────────────────────────────────────────

const TASK_TYPE_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  hito:         { bg: "#F3F4F6", color: "#6B7280", label: "Hito" },
  info_request: { bg: "#FFFBEB", color: "#D97706", label: "Info" },
  validation:   { bg: "#EEF2FF", color: "#4F46E5", label: "Valid." },
};

const OWNER_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  vambe:  { bg: "#F5F3FF", color: "#7C3AED", label: "Vambe" },
  client: { bg: "#EFF6FF", color: "#1D4ED8", label: "Cliente" },
};

const STEP_META: Record<number, { title: string; subtitle: string }> = {
  1: { title: "Datos del cliente",              subtitle: "Empieza con el correo y nombre de tu cliente" },
  2: { title: "Elige una plantilla de proyecto", subtitle: "Vambe creará el proyecto a partir de esta plantilla" },
  3: { title: "Personaliza las tareas",          subtitle: "Selecciona qué tareas iniciar con este cliente" },
};

const INITIAL_FORM: InviteForm = {
  email: "", full_name: "", company_name: "", owner_label: "", role: "client",
};

// ── Component ────────────────────────────────────────────────────

export default function InviteClientDialog({ open, onClose, onSuccess, accessToken }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<InviteForm>(INITIAL_FORM);
  const [templates, setTemplates] = useState<TemplateWithMeta[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [phasePreview, setPhasePreview] = useState<PhaseTaskPreview[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when opened
  useEffect(() => {
    if (open) {
      setStep(1);
      setForm(INITIAL_FORM);
      setSelectedTemplateId("");
      setPhasePreview([]);
      setExcludedIds(new Set());
      setError(null);
      loadTemplates();
    }
  }, [open]); // loadTemplates is stable (no deps)

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    const { data: tpls } = await supabase
      .from("project_templates")
      .select("*")
      .order("name");

    const allTemplates = tpls ?? [];

    if (allTemplates.length > 0) {
      const { data: phases } = await supabase
        .from("phase_templates")
        .select("id, template_id")
        .in("template_id", allTemplates.map((t) => t.id));

      const phaseIds = (phases ?? []).map((p) => p.id);
      const phaseCounts: Record<string, number> = {};
      const phaseTemplateMap: Record<string, string> = {};
      for (const p of phases ?? []) {
        phaseCounts[p.template_id] = (phaseCounts[p.template_id] ?? 0) + 1;
        phaseTemplateMap[p.id] = p.template_id;
      }

      const taskCounts: Record<string, number> = {};
      if (phaseIds.length > 0) {
        const { data: tasks } = await supabase
          .from("task_templates")
          .select("phase_template_id")
          .in("phase_template_id", phaseIds);
        for (const t of tasks ?? []) {
          const tid = phaseTemplateMap[t.phase_template_id];
          if (tid) taskCounts[tid] = (taskCounts[tid] ?? 0) + 1;
        }
      }

      setTemplates(
        allTemplates.map((t) => ({
          ...t,
          phase_count: phaseCounts[t.id] ?? 0,
          task_count: taskCounts[t.id] ?? 0,
        }))
      );
    } else {
      setTemplates([]);
    }

    setLoadingTemplates(false);
  };

  const loadPreview = async (templateId: string) => {
    setLoadingPreview(true);
    const { data: phases } = await supabase
      .from("phase_templates")
      .select("id, name, phase_number")
      .eq("template_id", templateId)
      .order("phase_number");

    const phaseIds = (phases ?? []).map((p) => p.id);
    const { data: tasks } = phaseIds.length > 0
      ? await supabase
          .from("task_templates")
          .select("id, name, task_type, owner_type, phase_template_id, sort_order")
          .in("phase_template_id", phaseIds)
          .order("sort_order")
      : { data: [] };

    setPhasePreview(
      (phases ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        phase_number: p.phase_number,
        tasks: (tasks ?? [])
          .filter((t) => t.phase_template_id === p.id)
          .map((t) => ({
            id: t.id,
            name: t.name,
            task_type: t.task_type as TaskType,
            owner_type: t.owner_type as OwnerType,
          })),
      }))
    );
    setExcludedIds(new Set());
    setLoadingPreview(false);
  };

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (form.role === "admin") {
      submitInvite();
    } else {
      setStep(2);
    }
  };

  const handleStep2 = () => {
    if (!selectedTemplateId) return;
    loadPreview(selectedTemplateId);
    setStep(3);
  };

  const submitInvite = async () => {
    setInviting(true);
    setError(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          company_name: form.company_name,
          role: form.role,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      const clientId = data.userId;

      if (form.role === "client" && selectedTemplateId && clientId) {
        await createProjectFromTemplate(
          clientId,
          selectedTemplateId,
          (form.owner_label || form.company_name).toUpperCase(),
          form.company_name,
          Array.from(excludedIds)
        );
      }

      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al invitar");
    } finally {
      setInviting(false);
    }
  };

  if (!open) return null;

  const isAdmin = form.role === "admin";
  const filledSegments = isAdmin ? 1 : step;
  const totalTasks = phasePreview.flatMap((p) => p.tasks).length;
  const selectedTasks = totalTasks - excludedIds.size;
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const meta = STEP_META[step];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(17,24,39,0.55)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="w-full flex flex-col overflow-hidden"
        style={{
          maxWidth: 640,
          maxHeight: "90vh",
          borderRadius: 20,
          boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
          background: "#fff",
        }}
      >
        {/* ── Gradient header ───────────────────────────────────── */}
        <div
          className="relative shrink-0"
          style={{
            background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
            padding: "20px 28px",
          }}
        >
          <p
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.80)",
              marginBottom: 4,
            }}
          >
            {isAdmin ? "PASO 1 DE 1" : `PASO ${step} DE 3`}
          </p>
          <p
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: "-0.4px",
              color: "#fff",
              marginBottom: 2,
            }}
          >
            {meta.title}
          </p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)" }}>{meta.subtitle}</p>

          {/* Progress bar */}
          <div className="mt-4 flex gap-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  background: i <= filledSegments ? "#fff" : "rgba(255,255,255,0.25)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-5 flex items-center justify-center"
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
            }}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px" }}>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <form id="invite-step1" onSubmit={handleStep1} className="space-y-4">
              {/* Email */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
                  Correo electrónico <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="cliente@empresa.com"
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "9px 12px",
                    border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13,
                    outline: "none", color: "#111827", background: "#fff",
                  }}
                />
              </div>

              {/* Name + Company */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
                    Nombre completo
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    placeholder="Nombre del cliente"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "9px 12px",
                      border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13,
                      outline: "none", color: "#111827", background: "#fff",
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 6 }}>
                    Empresa
                  </label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        company_name: e.target.value,
                        owner_label: f.owner_label || e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="Nombre de la empresa"
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "9px 12px",
                      border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13,
                      outline: "none", color: "#111827", background: "#fff",
                    }}
                  />
                </div>
              </div>

              {/* Owner label */}
              {form.role === "client" && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 4 }}>
                    Etiqueta del cliente{" "}
                    <span style={{ fontSize: 12, fontWeight: 400, color: "#9CA3AF" }}>
                      — Aparece en badges de tareas
                    </span>
                  </label>
                  <input
                    type="text"
                    value={form.owner_label}
                    onChange={(e) => setForm((f) => ({ ...f, owner_label: e.target.value }))}
                    placeholder={form.company_name.toUpperCase() || "CLIENTE"}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "9px 12px",
                      border: "1px solid #D1D5DB", borderRadius: 8, fontSize: 13,
                      textTransform: "uppercase", outline: "none",
                      color: "#111827", background: "#fff",
                    }}
                  />
                </div>
              )}

              {/* Role cards */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: "#374151", display: "block", marginBottom: 8 }}>
                  Rol
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {(["client", "admin"] as const).map((r) => {
                    const selected = form.role === r;
                    return (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, role: r }))}
                        style={{
                          padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                          border: selected ? "1.5px solid #6D28D9" : "1.5px solid #E5E7EB",
                          background: selected ? "#F8F7FF" : "#fff",
                          textAlign: "left", transition: "all 0.15s",
                        }}
                      >
                        <p style={{ fontSize: 14, fontWeight: 600, color: "#111827", marginBottom: 2 }}>
                          {r === "client" ? "👤 Cliente" : "🔑 Admin"}
                        </p>
                        <p style={{ fontSize: 12, color: "#6B7280" }}>
                          {r === "client" ? "Completa el onboarding" : "Gestiona clientes"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </form>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div>
              {loadingTemplates ? (
                <div className="flex justify-center py-10">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "#6D28D9", borderTopColor: "transparent" }} />
                </div>
              ) : templates.length === 0 ? (
                <p style={{ fontSize: 13, color: "#9CA3AF", textAlign: "center", padding: "32px 0" }}>
                  No hay plantillas de proyecto configuradas.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {templates.map((t) => {
                    const selected = selectedTemplateId === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(t.id)}
                        className="relative text-left"
                        style={{
                          padding: "14px 16px", borderRadius: 12, cursor: "pointer",
                          border: selected ? "1.5px solid #6D28D9" : "1.5px solid #E5E7EB",
                          background: selected ? "#F8F7FF" : "#fff",
                          transition: "all 0.15s",
                        }}
                      >
                        {selected && (
                          <span
                            className="absolute top-2 right-2 flex items-center justify-center"
                            style={{
                              width: 20, height: 20, borderRadius: "50%",
                              background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                              fontSize: 10, color: "#fff",
                            }}
                          >
                            ✓
                          </span>
                        )}
                        {t.industry && (
                          <p style={{
                            fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                            letterSpacing: "0.06em", color: "#9CA3AF", marginBottom: 4,
                          }}>
                            {t.industry}
                          </p>
                        )}
                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", marginBottom: 4 }}>
                          {t.name}
                        </p>
                        <p style={{
                          fontSize: 11.5, color: "#6B7280", marginBottom: 8,
                          minHeight: 34, display: "-webkit-box",
                          WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                        }}>
                          {t.description ?? ""}
                        </p>
                        <p style={{ fontSize: 10.5, fontWeight: 600, color: "#6B7280" }}>
                          {t.phase_count} fase{t.phase_count !== 1 ? "s" : ""} · {t.task_count} tarea{t.task_count !== 1 ? "s" : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Step 3 ── */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Summary card */}
              <div
                className="flex items-center gap-3"
                style={{ background: "#F8F7FF", borderRadius: 10, padding: "10px 14px" }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                    fontSize: 16,
                  }}
                >
                  ✨
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                    {selectedTemplate?.name ?? "Plantilla"}
                  </p>
                  <p style={{ fontSize: 11.5, color: "#6B7280" }}>
                    {selectedTasks} tarea{selectedTasks !== 1 ? "s" : ""} seleccionada{selectedTasks !== 1 ? "s" : ""} · {phasePreview.length} fase{phasePreview.length !== 1 ? "s" : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  style={{ fontSize: 12, fontWeight: 600, color: "#4F46E5", background: "none", border: "none", cursor: "pointer" }}
                >
                  Cambiar
                </button>
              </div>

              {/* Task list */}
              {loadingPreview ? (
                <div className="flex justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2" style={{ borderColor: "#6D28D9", borderTopColor: "transparent" }} />
                </div>
              ) : (
                <div
                  className="overflow-y-auto"
                  style={{
                    border: "1px solid #E5E7EB", borderRadius: 10,
                    maxHeight: 260, padding: "4px 0",
                  }}
                >
                  {phasePreview.map((phase) => (
                    <div key={phase.id}>
                      <p style={{
                        fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                        letterSpacing: "0.06em", color: "#9CA3AF",
                        padding: "10px 14px 4px",
                      }}>
                        FASE {phase.phase_number} — {phase.name}
                      </p>
                      {phase.tasks.map((task) => {
                        const excluded = excludedIds.has(task.id);
                        const ts = TASK_TYPE_STYLE[task.task_type] ?? TASK_TYPE_STYLE.hito;
                        const os = OWNER_STYLE[task.owner_type] ?? OWNER_STYLE.client;
                        return (
                          <label
                            key={task.id}
                            className="flex cursor-pointer items-center gap-2.5 hover:bg-gray-50"
                            style={{ padding: "6px 14px" }}
                          >
                            <input
                              type="checkbox"
                              checked={!excluded}
                              onChange={() =>
                                setExcludedIds((prev) => {
                                  const next = new Set(prev);
                                  if (excluded) { next.delete(task.id); } else { next.add(task.id); }
                                  return next;
                                })
                              }
                              style={{ accentColor: "#6D28D9", width: 14, height: 14, cursor: "pointer" }}
                            />
                            <span className="flex-1 truncate" style={{ fontSize: 12.5, color: "#374151" }}>
                              {task.name}
                            </span>
                            <span style={{
                              fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
                              padding: "2px 7px", borderRadius: 10,
                              background: ts.bg, color: ts.color,
                            }}>
                              {ts.label}
                            </span>
                            <span style={{
                              fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
                              padding: "2px 7px", borderRadius: 10,
                              background: os.bg, color: os.color,
                            }}>
                              {os.label}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ───────────────────────────────────────────── */}
        <div
          className="shrink-0 flex items-center"
          style={{
            background: "#F9FAFB", borderTop: "1px solid #E5E7EB",
            padding: "14px 28px", gap: 12,
          }}
        >
          {/* Back */}
          <div style={{ minWidth: 80 }}>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                style={{
                  fontSize: 13, fontWeight: 500, color: "#4B5563",
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}
              >
                ← Atrás
              </button>
            )}
          </div>

          {/* Center: helper text on step 3 */}
          <div className="flex-1 text-center">
            {step === 3 && (
              <p style={{ fontSize: 12, color: "#6B7280" }}>
                Se enviará una invitación por correo a{" "}
                <span style={{ fontWeight: 600 }}>{form.email}</span>
              </p>
            )}
          </div>

          {/* Error inline */}
          {error && step !== 3 && (
            <p style={{ fontSize: 12, color: "#DC2626", flex: 1 }}>{error}</p>
          )}

          {/* Primary action */}
          {step === 1 && (
            <button
              type="submit"
              form="invite-step1"
              disabled={inviting}
              style={{
                padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                color: "#fff", border: "none", cursor: inviting ? "wait" : "pointer",
                background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                boxShadow: "0 3px 12px rgba(109,40,217,0.30)",
                opacity: inviting ? 0.6 : 1,
              }}
            >
              {inviting ? "Enviando..." : isAdmin ? "Enviar invitación" : "Siguiente →"}
            </button>
          )}

          {step === 2 && (
            <button
              type="button"
              onClick={handleStep2}
              disabled={!selectedTemplateId}
              style={{
                padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                color: "#fff", border: "none", cursor: selectedTemplateId ? "pointer" : "default",
                background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                boxShadow: "0 3px 12px rgba(109,40,217,0.30)",
                opacity: selectedTemplateId ? 1 : 0.4,
              }}
            >
              Siguiente →
            </button>
          )}

          {step === 3 && (
            <div className="flex flex-col items-end gap-1">
              {error && (
                <p style={{ fontSize: 12, color: "#DC2626" }}>{error}</p>
              )}
              <button
                type="button"
                onClick={submitInvite}
                disabled={inviting || loadingPreview}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 20px", borderRadius: 9, fontSize: 13, fontWeight: 600,
                  color: "#fff", border: "none", cursor: inviting ? "wait" : "pointer",
                  background: "linear-gradient(135deg, #4F46E5, #6D28D9)",
                  boxShadow: "0 3px 12px rgba(109,40,217,0.30)",
                  opacity: inviting || loadingPreview ? 0.6 : 1,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                  <path d="M2 3l16 7-16 7V11l11-1-11-1V3z" fill="currentColor" />
                </svg>
                {inviting ? "Enviando..." : "Enviar invitación"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
