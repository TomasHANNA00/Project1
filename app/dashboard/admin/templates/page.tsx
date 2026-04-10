"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { ProjectTemplate, PhaseTemplate, TaskTemplate, QuestionTemplate } from "@/lib/types";

// ── Icons ────────────────────────────────────────────────────

function ChevronDown() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ── Badges ───────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  if (type === "hito") {
    return (
      <span style={{ background: "#F1F5F9", color: "#64748B" }} className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
        Hito
      </span>
    );
  }
  if (type === "info_request") {
    return (
      <span style={{ background: "#DBEAFE", color: "#1D4ED8" }} className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
        Info
      </span>
    );
  }
  return (
    <span style={{ background: "#EDE9FE", color: "#6D28D9" }} className="rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap">
      Validación
    </span>
  );
}

function OwnerBadge({ owner }: { owner: string }) {
  return (
    <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-500 whitespace-nowrap">
      {owner === "client" ? "Cliente" : "Vambe"}
    </span>
  );
}

// ── Main component ───────────────────────────────────────────

export default function TemplatesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Template list
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [selected, setSelected] = useState<ProjectTemplate | null>(null);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  // Phases + tasks + questions for selected template
  const [phases, setPhases] = useState<PhaseTemplate[]>([]);
  const [tasks, setTasks] = useState<Record<string, TaskTemplate[]>>({});
  const [questions, setQuestions] = useState<Record<string, QuestionTemplate[]>>({});

  // Collapsed state
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  // Saving
  const [saving, setSaving] = useState(false);

  // Add task form
  const [addingTaskToPhase, setAddingTaskToPhase] = useState<string | null>(null);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskType, setNewTaskType] = useState<"hito" | "info_request" | "validation">("hito");
  const [newTaskOwner, setNewTaskOwner] = useState<"client" | "vambe">("vambe");
  const [newTaskDays, setNewTaskDays] = useState(7);
  const [newTaskDesc, setNewTaskDesc] = useState("");

  // Edit task form
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState("");
  const [editTaskDesc, setEditTaskDesc] = useState("");
  const [editTaskOwner, setEditTaskOwner] = useState<"client" | "vambe">("vambe");
  const [editTaskDays, setEditTaskDays] = useState(7);

  // Delete task confirm
  const [deleteTaskConfirm, setDeleteTaskConfirm] = useState<{ task: TaskTemplate; phaseId: string } | null>(null);

  // Add question form
  const [addingQuestionToTask, setAddingQuestionToTask] = useState<string | null>(null);
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionPlaceholder, setNewQuestionPlaceholder] = useState("");

  // Edit question form
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editQuestionText, setEditQuestionText] = useState("");
  const [editQuestionPlaceholder, setEditQuestionPlaceholder] = useState("");

  // Delete question confirm
  const [deleteQuestionConfirm, setDeleteQuestionConfirm] = useState<{ question: QuestionTemplate; taskId: string } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    const { data } = await supabase.from("project_templates").select("*").order("name");
    setTemplates(data ?? []);
    setLoadingTemplates(false);
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") loadTemplates();
  }, [authLoading, profile, loadTemplates]);

  const loadTemplate = async (t: ProjectTemplate) => {
    setSelected(t);
    setPhases([]);
    setTasks({});
    setQuestions({});
    setExpandedPhases(new Set());
    setExpandedTasks(new Set());
    setAddingTaskToPhase(null);
    setEditingTask(null);
    setEditingQuestion(null);

    // Load phases
    const { data: phaseData } = await supabase
      .from("phase_templates")
      .select("*")
      .eq("template_id", t.id)
      .order("phase_number");
    const phaseList: PhaseTemplate[] = phaseData ?? [];
    setPhases(phaseList);
    // Expand all phases by default
    setExpandedPhases(new Set(phaseList.map((p) => p.id)));

    if (phaseList.length === 0) return;

    // Load all tasks for this template's phases
    const phaseIds = phaseList.map((p) => p.id);
    const { data: taskData } = await supabase
      .from("task_templates")
      .select("*")
      .in("phase_template_id", phaseIds)
      .order("sort_order");

    const taskMap: Record<string, TaskTemplate[]> = {};
    for (const phase of phaseList) {
      taskMap[phase.id] = (taskData ?? []).filter((tk) => tk.phase_template_id === phase.id);
    }
    setTasks(taskMap);

    // Load questions for all info_request tasks
    const infoTasks = (taskData ?? []).filter((tk) => tk.task_type === "info_request");
    if (infoTasks.length > 0) {
      const taskIds = infoTasks.map((tk) => tk.id);
      const { data: qData } = await supabase
        .from("question_templates")
        .select("*")
        .in("task_template_id", taskIds)
        .order("sort_order");
      const qMap: Record<string, QuestionTemplate[]> = {};
      for (const tk of infoTasks) {
        qMap[tk.id] = (qData ?? []).filter((q) => q.task_template_id === tk.id);
      }
      setQuestions(qMap);
    }
  };

  const togglePhase = (phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  };

  const toggleTask = (taskId: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  // ── Task CRUD ─────────────────────────────────────────────

  const addTask = async (phaseId: string) => {
    if (!newTaskName.trim()) return;
    setSaving(true);
    const currentTasks = tasks[phaseId] ?? [];
    const maxOrder = currentTasks.length > 0 ? Math.max(...currentTasks.map((tk) => tk.sort_order ?? 0)) : 0;
    const { data, error } = await supabase
      .from("task_templates")
      .insert({
        phase_template_id: phaseId,
        name: newTaskName.trim(),
        task_type: newTaskType,
        owner_type: newTaskOwner,
        default_due_offset_days: newTaskDays,
        sort_order: maxOrder + 1,
        description: newTaskDesc.trim() || null,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) return;

    setTasks((prev) => ({ ...prev, [phaseId]: [...(prev[phaseId] ?? []), data] }));
    if (newTaskType === "info_request") {
      setQuestions((prev) => ({ ...prev, [data.id]: [] }));
    }
    setAddingTaskToPhase(null);
    setNewTaskName(""); setNewTaskType("hito"); setNewTaskOwner("vambe");
    setNewTaskDays(7); setNewTaskDesc("");
  };

  const startEditTask = (task: TaskTemplate) => {
    setEditingTask(task.id);
    setEditTaskName(task.name);
    setEditTaskDesc(task.description ?? "");
    setEditTaskOwner(task.owner_type);
    setEditTaskDays(task.default_due_offset_days ?? 7);
    setAddingTaskToPhase(null);
    setEditingQuestion(null);
  };

  const saveTask = async (task: TaskTemplate, phaseId: string) => {
    if (!editTaskName.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("task_templates")
      .update({
        name: editTaskName.trim(),
        description: editTaskDesc.trim() || null,
        owner_type: editTaskOwner,
        default_due_offset_days: editTaskDays,
      })
      .eq("id", task.id);
    setSaving(false);
    if (error) return;
    setTasks((prev) => ({
      ...prev,
      [phaseId]: (prev[phaseId] ?? []).map((tk) =>
        tk.id === task.id
          ? { ...tk, name: editTaskName.trim(), description: editTaskDesc.trim() || null, owner_type: editTaskOwner, default_due_offset_days: editTaskDays }
          : tk
      ),
    }));
    setEditingTask(null);
  };

  const deleteTask = async (task: TaskTemplate, phaseId: string) => {
    setSaving(true);
    await supabase.from("task_templates").delete().eq("id", task.id);
    setSaving(false);
    setTasks((prev) => ({ ...prev, [phaseId]: (prev[phaseId] ?? []).filter((tk) => tk.id !== task.id) }));
    setQuestions((prev) => { const next = { ...prev }; delete next[task.id]; return next; });
    setDeleteTaskConfirm(null);
  };

  // ── Question CRUD ─────────────────────────────────────────

  const addQuestion = async (taskId: string) => {
    if (!newQuestionText.trim()) return;
    setSaving(true);
    const currentQs = questions[taskId] ?? [];
    const maxOrder = currentQs.length > 0 ? Math.max(...currentQs.map((q) => q.sort_order ?? 0)) : 0;
    const { data, error } = await supabase
      .from("question_templates")
      .insert({
        task_template_id: taskId,
        question_text: newQuestionText.trim(),
        placeholder: newQuestionPlaceholder.trim() || null,
        sort_order: maxOrder + 1,
      })
      .select()
      .single();
    setSaving(false);
    if (error || !data) return;
    setQuestions((prev) => ({ ...prev, [taskId]: [...(prev[taskId] ?? []), data] }));
    setAddingQuestionToTask(null);
    setNewQuestionText(""); setNewQuestionPlaceholder("");
  };

  const startEditQuestion = (q: QuestionTemplate) => {
    setEditingQuestion(q.id);
    setEditQuestionText(q.question_text);
    setEditQuestionPlaceholder(q.placeholder ?? "");
    setAddingQuestionToTask(null);
  };

  const saveQuestion = async (q: QuestionTemplate, taskId: string) => {
    if (!editQuestionText.trim()) return;
    setSaving(true);
    await supabase
      .from("question_templates")
      .update({ question_text: editQuestionText.trim(), placeholder: editQuestionPlaceholder.trim() || null })
      .eq("id", q.id);
    setSaving(false);
    setQuestions((prev) => ({
      ...prev,
      [taskId]: (prev[taskId] ?? []).map((item) =>
        item.id === q.id
          ? { ...item, question_text: editQuestionText.trim(), placeholder: editQuestionPlaceholder.trim() || null }
          : item
      ),
    }));
    setEditingQuestion(null);
  };

  const deleteQuestion = async (q: QuestionTemplate, taskId: string) => {
    setSaving(true);
    await supabase.from("question_templates").delete().eq("id", q.id);
    setSaving(false);
    setQuestions((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? []).filter((item) => item.id !== q.id) }));
    setDeleteQuestionConfirm(null);
  };

  if (authLoading || !user) return null;

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: "#F5F7FB", minHeight: "100%" }} className="p-6">

      {/* Warning banner */}
      <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Nota:</strong> Los cambios en plantillas solo afectan proyectos nuevos. Los proyectos de clientes existentes no se modifican.
      </div>

      {/* Page title + template selector */}
      <div className="mb-6">
        <h1 className="mb-3 text-xl font-bold" style={{ color: "#0F1629" }}>
          Editor de Plantillas
        </h1>

        {loadingTemplates ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            Cargando plantillas...
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => loadTemplate(t)}
                className="rounded-xl px-4 py-2 text-sm font-medium transition-all"
                style={
                  selected?.id === t.id
                    ? { background: "#0F1629", color: "#fff" }
                    : { background: "#fff", color: "#52525b", border: "1px solid #e4e4e7" }
                }
              >
                {t.name}
                {t.industry && (
                  <span className="ml-1.5 text-xs opacity-60">· {t.industry}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Template content */}
      {!selected ? (
        <div className="flex items-center justify-center py-24 text-center">
          <div>
            <div className="mb-3 text-4xl">📋</div>
            <p className="text-zinc-500 text-sm">Selecciona una plantilla para editarla</p>
          </div>
        </div>
      ) : (
        <div className="max-w-3xl space-y-3">
          {phases.length === 0 ? (
            <div
              className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500"
              style={{ borderColor: "#E2E8F0" }}
            >
              Esta plantilla no tiene fases configuradas.
            </div>
          ) : (
            phases.map((phase) => {
              const phaseTasks = tasks[phase.id] ?? [];
              const isExpanded = expandedPhases.has(phase.id);
              return (
                <div
                  key={phase.id}
                  className="overflow-hidden rounded-2xl border bg-white"
                  style={{ borderColor: "#E2E8F0" }}
                >
                  {/* Phase header */}
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-zinc-50"
                  >
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: "#0F1629" }}
                    >
                      {phase.phase_number}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-zinc-900">{phase.name}</p>
                      <p className="text-xs text-zinc-400">
                        {phaseTasks.length} tarea{phaseTasks.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span
                      className="text-zinc-400 transition-transform duration-200"
                      style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)" }}
                    >
                      <ChevronDown />
                    </span>
                  </button>

                  {/* Phase body */}
                  {isExpanded && (
                    <div className="border-t px-5 pb-4 pt-3" style={{ borderColor: "#E2E8F0" }}>
                      <div className="space-y-2">
                        {phaseTasks.map((task) => (
                          <div key={task.id}>
                            {editingTask === task.id ? (
                              /* ── Task edit mode ── */
                              <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                                <input
                                  type="text"
                                  value={editTaskName}
                                  onChange={(e) => setEditTaskName(e.target.value)}
                                  placeholder="Nombre de la tarea"
                                  className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                                <textarea
                                  rows={2}
                                  value={editTaskDesc}
                                  onChange={(e) => setEditTaskDesc(e.target.value)}
                                  placeholder="Descripción (opcional)"
                                  className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <select
                                    value={editTaskOwner}
                                    onChange={(e) => setEditTaskOwner(e.target.value as "client" | "vambe")}
                                    className="rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none"
                                  >
                                    <option value="vambe">Propietario: Vambe</option>
                                    <option value="client">Propietario: Cliente</option>
                                  </select>
                                  <div className="flex items-center gap-1">
                                    <input
                                      type="number"
                                      value={editTaskDays}
                                      onChange={(e) => setEditTaskDays(Number(e.target.value))}
                                      min={0}
                                      className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs outline-none"
                                    />
                                    <span className="text-xs text-zinc-400">días desde inicio</span>
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => saveTask(task, phase.id)}
                                    disabled={saving || !editTaskName.trim()}
                                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                    style={{ background: "#0F1629" }}
                                  >
                                    {saving ? "Guardando..." : "Guardar"}
                                  </button>
                                  <button
                                    onClick={() => setEditingTask(null)}
                                    className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* ── Task view mode ── */
                              <div>
                                <div
                                  className="group flex items-center gap-3 rounded-xl border bg-zinc-50 px-3 py-2.5"
                                  style={{ borderColor: "#E2E8F0" }}
                                >
                                  {/* Expand toggle for info_request */}
                                  {task.task_type === "info_request" ? (
                                    <button
                                      onClick={() => toggleTask(task.id)}
                                      className="shrink-0 text-zinc-400 hover:text-zinc-600 transition-colors"
                                    >
                                      {expandedTasks.has(task.id) ? <ChevronDown /> : <ChevronRight />}
                                    </button>
                                  ) : (
                                    <span className="w-4 shrink-0" />
                                  )}

                                  <span className="min-w-0 flex-1 text-sm font-medium text-zinc-900 truncate">
                                    {task.name}
                                  </span>

                                  <TypeBadge type={task.task_type} />
                                  <OwnerBadge owner={task.owner_type} />

                                  {task.default_due_offset_days != null && (
                                    <span className="text-xs text-zinc-400 whitespace-nowrap">
                                      +{task.default_due_offset_days}d
                                    </span>
                                  )}

                                  <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                                    <button
                                      onClick={() => startEditTask(task)}
                                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                      title="Editar"
                                    >
                                      <EditIcon />
                                    </button>
                                    <button
                                      onClick={() => setDeleteTaskConfirm({ task, phaseId: phase.id })}
                                      className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-100 hover:text-red-600"
                                      title="Eliminar"
                                    >
                                      <TrashIcon />
                                    </button>
                                  </div>
                                </div>

                                {/* Questions panel — only for info_request when expanded */}
                                {task.task_type === "info_request" && expandedTasks.has(task.id) && (
                                  <div
                                    className="ml-7 mt-1 space-y-2 rounded-xl border bg-white p-3"
                                    style={{ borderColor: "#E2E8F0" }}
                                  >
                                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                      Preguntas
                                    </p>

                                    {(questions[task.id] ?? []).map((q) => (
                                      <div key={q.id}>
                                        {editingQuestion === q.id ? (
                                          <div className="space-y-1.5 rounded-lg border border-blue-200 bg-blue-50 p-2">
                                            <input
                                              type="text"
                                              value={editQuestionText}
                                              onChange={(e) => setEditQuestionText(e.target.value)}
                                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                            />
                                            <input
                                              type="text"
                                              value={editQuestionPlaceholder}
                                              onChange={(e) => setEditQuestionPlaceholder(e.target.value)}
                                              placeholder="Placeholder (opcional)"
                                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                            />
                                            <div className="flex gap-1.5">
                                              <button
                                                onClick={() => saveQuestion(q, task.id)}
                                                disabled={saving || !editQuestionText.trim()}
                                                className="rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                                                style={{ background: "#0F1629" }}
                                              >
                                                {saving ? "..." : "Guardar"}
                                              </button>
                                              <button
                                                onClick={() => setEditingQuestion(null)}
                                                className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
                                              >
                                                Cancelar
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <div className="group/q flex items-start gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-2.5 py-2">
                                            <div className="min-w-0 flex-1">
                                              <p className="text-xs font-medium text-zinc-800">{q.question_text}</p>
                                              {q.placeholder && (
                                                <p className="mt-0.5 text-xs italic text-zinc-400">{q.placeholder}</p>
                                              )}
                                            </div>
                                            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover/q:opacity-100">
                                              <button
                                                onClick={() => startEditQuestion(q)}
                                                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
                                              >
                                                <EditIcon />
                                              </button>
                                              <button
                                                onClick={() => setDeleteQuestionConfirm({ question: q, taskId: task.id })}
                                                className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-500"
                                              >
                                                <TrashIcon />
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}

                                    {/* Add question */}
                                    {addingQuestionToTask === task.id ? (
                                      <div className="space-y-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-2">
                                        <input
                                          type="text"
                                          value={newQuestionText}
                                          onChange={(e) => setNewQuestionText(e.target.value)}
                                          placeholder="Texto de la pregunta *"
                                          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                          autoFocus
                                        />
                                        <input
                                          type="text"
                                          value={newQuestionPlaceholder}
                                          onChange={(e) => setNewQuestionPlaceholder(e.target.value)}
                                          placeholder="Placeholder (opcional)"
                                          className="w-full rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-blue-500"
                                        />
                                        <div className="flex gap-1.5">
                                          <button
                                            onClick={() => addQuestion(task.id)}
                                            disabled={saving || !newQuestionText.trim()}
                                            className="rounded-md px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                                            style={{ background: "#0F1629" }}
                                          >
                                            {saving ? "..." : "Añadir"}
                                          </button>
                                          <button
                                            onClick={() => { setAddingQuestionToTask(null); setNewQuestionText(""); setNewQuestionPlaceholder(""); }}
                                            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600"
                                          >
                                            Cancelar
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => { setAddingQuestionToTask(task.id); setNewQuestionText(""); setNewQuestionPlaceholder(""); setEditingQuestion(null); }}
                                        className="flex w-full items-center gap-1.5 rounded-lg border border-dashed border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-blue-300 hover:text-blue-600"
                                      >
                                        + Agregar pregunta
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {/* Add task */}
                        {addingTaskToPhase === phase.id ? (
                          <div className="space-y-2 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3">
                            <input
                              type="text"
                              value={newTaskName}
                              onChange={(e) => setNewTaskName(e.target.value)}
                              placeholder="Nombre de la tarea *"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                              autoFocus
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                value={newTaskType}
                                onChange={(e) => setNewTaskType(e.target.value as "hito" | "info_request" | "validation")}
                                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none"
                              >
                                <option value="hito">Hito</option>
                                <option value="info_request">Info</option>
                                <option value="validation">Validación</option>
                              </select>
                              <select
                                value={newTaskOwner}
                                onChange={(e) => setNewTaskOwner(e.target.value as "client" | "vambe")}
                                className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none"
                              >
                                <option value="vambe">Vambe</option>
                                <option value="client">Cliente</option>
                              </select>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  value={newTaskDays}
                                  onChange={(e) => setNewTaskDays(Number(e.target.value))}
                                  min={0}
                                  className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-sm outline-none"
                                />
                                <span className="text-xs text-zinc-400">días</span>
                              </div>
                            </div>
                            <textarea
                              rows={2}
                              value={newTaskDesc}
                              onChange={(e) => setNewTaskDesc(e.target.value)}
                              placeholder="Descripción (opcional)"
                              className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => addTask(phase.id)}
                                disabled={saving || !newTaskName.trim()}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                style={{ background: "#0F1629" }}
                              >
                                {saving ? "Añadiendo..." : "Añadir tarea"}
                              </button>
                              <button
                                onClick={() => { setAddingTaskToPhase(null); setNewTaskName(""); setNewTaskDesc(""); }}
                                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setAddingTaskToPhase(phase.id);
                              setEditingTask(null);
                              setEditingQuestion(null);
                              setNewTaskName(""); setNewTaskType("hito");
                              setNewTaskOwner("vambe"); setNewTaskDays(7); setNewTaskDesc("");
                            }}
                            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-400 transition-colors hover:border-blue-300 hover:text-blue-600"
                          >
                            + Agregar tarea
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Delete task confirm ──────────────────────────────── */}
      {deleteTaskConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar tarea?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar <strong>{deleteTaskConfirm.task.name}</strong>? Los proyectos existentes no se ven afectados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteTask(deleteTaskConfirm.task, deleteTaskConfirm.phaseId)}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteTaskConfirm(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete question confirm ─────────────────────────── */}
      {deleteQuestionConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar pregunta?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar esta pregunta? Los proyectos existentes no se ven afectados.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteQuestion(deleteQuestionConfirm.question, deleteQuestionConfirm.taskId)}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteQuestionConfirm(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
