"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { OnboardingTemplate, OnboardingSection, PartWithSections } from "@/lib/types";

export default function TemplatesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [parts, setParts] = useState<PartWithSections[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Template selection + metadata editing
  const [selected, setSelected] = useState<OnboardingTemplate | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");

  // New template modal
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Delete template confirm
  const [deleteConfirm, setDeleteConfirm] = useState<OnboardingTemplate | null>(null);

  // Inline section editing
  const [editingSection, setEditingSection] = useState<number | null>(null);
  const [editSectionTitle, setEditSectionTitle] = useState("");
  const [editSectionDesc, setEditSectionDesc] = useState("");

  // Delete section confirm
  const [deleteConfirmSection, setDeleteConfirmSection] = useState<OnboardingSection | null>(null);

  // Add section to existing part
  const [addingToPartId, setAddingToPartId] = useState<number | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionDesc, setNewSectionDesc] = useState("");

  // Add new part (requires first section)
  const [showAddPart, setShowAddPart] = useState(false);
  const [newPartTitle, setNewPartTitle] = useState("");
  const [newPartWhyAsk, setNewPartWhyAsk] = useState("");
  const [newPartSectionTitle, setNewPartSectionTitle] = useState("");
  const [newPartSectionDesc, setNewPartSectionDesc] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const loadTemplates = async () => {
    const { data } = await supabase.from("onboarding_templates").select("*").order("id");
    setTemplates(data ?? []);
  };

  const loadParts = async (templateId: number) => {
    const { data: pData } = await supabase.from("onboarding_parts").select("*").order("part_number");
    const { data: sData } = await supabase
      .from("onboarding_sections")
      .select("*")
      .eq("template_id", templateId)
      .order("section_order");
    const merged: PartWithSections[] = (pData ?? [])
      .map((p) => ({
        ...p,
        sections: (sData ?? [])
          .filter((s) => s.part_id === p.id)
          .sort((a, b) => a.section_order - b.section_order),
      }))
      .filter((p) => p.sections.length > 0);
    setParts(merged);
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadTemplates();
      setLoading(false);
    };
    if (!authLoading && profile?.role === "admin") init();
  }, [authLoading, profile]);

  const openTemplate = async (t: OnboardingTemplate) => {
    setSelected(t);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    setError(null);
    setEditingSection(null);
    setAddingToPartId(null);
    setShowAddPart(false);
    await loadParts(t.id);
  };

  // ── Template metadata ────────────────────────────────────────
  const saveTemplate = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("onboarding_templates")
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq("id", selected.id);
    if (err) { setError(err.message); setSaving(false); return; }
    const updated = { ...selected, name: editName.trim(), description: editDesc.trim() || null };
    setSelected(updated);
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSaving(false);
  };

  const createTemplate = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    const { data, error: err } = await supabase
      .from("onboarding_templates")
      .insert({ name: newName.trim(), description: newDesc.trim() || null })
      .select()
      .single();
    if (err) { setError(err.message); setSaving(false); return; }
    setSaving(false);
    setShowNewForm(false);
    setNewName(""); setNewDesc("");
    await loadTemplates();
    if (data) openTemplate(data);
  };

  const deleteTemplate = async (t: OnboardingTemplate) => {
    setSaving(true);
    await supabase.from("onboarding_templates").delete().eq("id", t.id);
    setSaving(false);
    setDeleteConfirm(null);
    if (selected?.id === t.id) { setSelected(null); setParts([]); }
    await loadTemplates();
  };

  // ── Section CRUD ─────────────────────────────────────────────
  const startEditSection = (s: OnboardingSection) => {
    setEditingSection(s.id);
    setEditSectionTitle(s.title);
    setEditSectionDesc(s.description);
    setAddingToPartId(null);
    setShowAddPart(false);
  };

  const saveSection = async () => {
    if (!editingSection || !selected) return;
    setSaving(true);
    await supabase
      .from("onboarding_sections")
      .update({ title: editSectionTitle.trim(), description: editSectionDesc.trim() })
      .eq("id", editingSection);
    setEditingSection(null);
    setSaving(false);
    await loadParts(selected.id);
  };

  const deleteSection = async (s: OnboardingSection) => {
    if (!selected) return;
    setSaving(true);
    await supabase.from("onboarding_sections").delete().eq("id", s.id);
    setDeleteConfirmSection(null);
    setSaving(false);
    await loadParts(selected.id);
  };

  const addSection = async () => {
    if (!addingToPartId || !selected || !newSectionTitle.trim()) return;
    setSaving(true);
    const partSections = parts.find((p) => p.id === addingToPartId)?.sections ?? [];
    const maxOrder = partSections.length > 0 ? Math.max(...partSections.map((s) => s.section_order)) : 0;
    const { data: newSec } = await supabase
      .from("onboarding_sections")
      .insert({
        part_id: addingToPartId,
        section_order: maxOrder + 1,
        title: newSectionTitle.trim(),
        description: newSectionDesc.trim(),
        template_id: selected.id,
      })
      .select()
      .single();
    if (newSec) {
      await supabase.from("template_sections").insert({
        template_id: selected.id,
        section_id: newSec.id,
        display_order: maxOrder + 1,
      });
    }
    setAddingToPartId(null);
    setNewSectionTitle(""); setNewSectionDesc("");
    setSaving(false);
    await loadParts(selected.id);
  };

  // ── Part CRUD ────────────────────────────────────────────────
  const addPart = async () => {
    if (!selected || !newPartTitle.trim() || !newPartSectionTitle.trim()) return;
    setSaving(true);
    const maxPartNum = parts.length > 0 ? Math.max(...parts.map((p) => p.part_number)) : 0;
    const { data: newPart } = await supabase
      .from("onboarding_parts")
      .insert({
        part_number: maxPartNum + 1,
        title: newPartTitle.trim(),
        why_we_ask: newPartWhyAsk.trim(),
      })
      .select()
      .single();
    if (newPart) {
      const { data: newSec } = await supabase
        .from("onboarding_sections")
        .insert({
          part_id: newPart.id,
          section_order: 1,
          title: newPartSectionTitle.trim(),
          description: newPartSectionDesc.trim(),
          template_id: selected.id,
        })
        .select()
        .single();
      if (newSec) {
        await supabase.from("template_sections").insert({
          template_id: selected.id,
          section_id: newSec.id,
          display_order: 1,
        });
      }
    }
    setShowAddPart(false);
    setNewPartTitle(""); setNewPartWhyAsk("");
    setNewPartSectionTitle(""); setNewPartSectionDesc("");
    setSaving(false);
    await loadParts(selected.id);
  };

  if (authLoading || !user) return null;

  const totalSections = parts.reduce((acc, p) => acc + p.sections.length, 0);

  return (
    <div className="flex h-full">
      {/* ── Left panel: template list ─────────────────────────── */}
      <div className="flex w-72 shrink-0 flex-col border-r border-zinc-200 bg-white">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
          <h1 className="text-base font-bold text-zinc-900">Plantillas</h1>
          <button
            onClick={() => { setShowNewForm(true); setError(null); }}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            + Nueva
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : (
          <ul className="flex-1 overflow-auto p-2">
            {templates.map((t) => {
              const isActive = selected?.id === t.id;
              return (
                <li key={t.id}>
                  <div
                    onClick={() => openTemplate(t)}
                    className={`group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <p className="text-sm font-medium">{t.name}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(t); }}
                      className="hidden rounded p-1 text-zinc-300 hover:text-red-500 group-hover:block"
                    >
                      🗑
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Right panel: template editor ─────────────────────── */}
      <div className="flex-1 overflow-auto p-6">
        {!selected ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="text-3xl">🗂️</p>
              <p className="mt-2 text-sm text-zinc-500">Selecciona una plantilla para editarla</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-6">

            {/* Template metadata */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <h2 className="mb-4 text-base font-semibold text-zinc-900">Datos de la plantilla</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Nombre</label>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Descripción (opcional)</label>
                  <textarea
                    rows={2}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>
              <button
                onClick={saveTemplate}
                disabled={saving}
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Guardando..." : "Guardar nombre"}
              </button>
            </div>

            {/* Sections by part */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-zinc-900">Secciones</h2>
                <span className="text-sm text-zinc-400">{totalSections} en total</span>
              </div>

              <div className="space-y-6">
                {parts.map((part) => (
                  <div key={part.id}>
                    {/* Part header */}
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Parte {part.part_number} — {part.title}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {part.sections.map((section) =>
                        editingSection === section.id ? (
                          /* ── Edit mode ── */
                          <div key={section.id} className="rounded-lg border border-blue-300 bg-blue-50 p-3 space-y-2">
                            <input
                              type="text"
                              value={editSectionTitle}
                              onChange={(e) => setEditSectionTitle(e.target.value)}
                              placeholder="Título"
                              className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <textarea
                              rows={3}
                              value={editSectionDesc}
                              onChange={(e) => setEditSectionDesc(e.target.value)}
                              placeholder="Descripción (qué le pedimos al cliente)"
                              className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={saveSection}
                                disabled={saving}
                                className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                {saving ? "Guardando..." : "Guardar"}
                              </button>
                              <button
                                onClick={() => setEditingSection(null)}
                                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── View mode ── */
                          <div key={section.id} className="group flex items-start gap-3 rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-zinc-900">{section.title}</p>
                              <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{section.description}</p>
                            </div>
                            <div className="flex shrink-0 gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEditSection(section)}
                                className="rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700"
                                title="Editar"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => setDeleteConfirmSection(section)}
                                className="rounded p-1 text-zinc-400 hover:bg-red-100 hover:text-red-600"
                                title="Eliminar"
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        )
                      )}

                      {/* Add section to this part */}
                      {addingToPartId === part.id ? (
                        <div className="rounded-lg border border-dashed border-blue-300 bg-blue-50/50 p-3 space-y-2">
                          <input
                            type="text"
                            value={newSectionTitle}
                            onChange={(e) => setNewSectionTitle(e.target.value)}
                            placeholder="Título de la sección *"
                            className="w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            autoFocus
                          />
                          <textarea
                            rows={2}
                            value={newSectionDesc}
                            onChange={(e) => setNewSectionDesc(e.target.value)}
                            placeholder="Descripción (qué le pedimos al cliente)"
                            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-1.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={addSection}
                              disabled={saving || !newSectionTitle.trim()}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {saving ? "Añadiendo..." : "Añadir"}
                            </button>
                            <button
                              onClick={() => { setAddingToPartId(null); setNewSectionTitle(""); setNewSectionDesc(""); }}
                              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setAddingToPartId(part.id); setEditingSection(null); setShowAddPart(false); setNewSectionTitle(""); setNewSectionDesc(""); }}
                          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
                        >
                          + Nueva sección
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Add new part */}
                {showAddPart ? (
                  <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-zinc-700">Nueva parte</p>
                    <input
                      type="text"
                      value={newPartTitle}
                      onChange={(e) => setNewPartTitle(e.target.value)}
                      placeholder="Título de la parte *"
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      autoFocus
                    />
                    <textarea
                      rows={2}
                      value={newPartWhyAsk}
                      onChange={(e) => setNewPartWhyAsk(e.target.value)}
                      placeholder="¿Por qué te pedimos esto? (visible para el cliente)"
                      className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    />
                    <div className="border-t border-zinc-200 pt-3">
                      <p className="mb-2 text-xs font-medium text-zinc-500">Primera sección (obligatoria para crear la parte)</p>
                      <input
                        type="text"
                        value={newPartSectionTitle}
                        onChange={(e) => setNewPartSectionTitle(e.target.value)}
                        placeholder="Título de la primera sección *"
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                      <textarea
                        rows={2}
                        value={newPartSectionDesc}
                        onChange={(e) => setNewPartSectionDesc(e.target.value)}
                        placeholder="Descripción"
                        className="mt-2 w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={addPart}
                        disabled={saving || !newPartTitle.trim() || !newPartSectionTitle.trim()}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving ? "Creando..." : "Crear parte"}
                      </button>
                      <button
                        onClick={() => { setShowAddPart(false); setNewPartTitle(""); setNewPartWhyAsk(""); setNewPartSectionTitle(""); setNewPartSectionDesc(""); }}
                        className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowAddPart(true); setEditingSection(null); setAddingToPartId(null); }}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 py-3 text-sm font-medium text-zinc-400 hover:border-blue-300 hover:text-blue-600 transition-colors"
                  >
                    + Nueva parte
                  </button>
                )}
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          </div>
        )}
      </div>

      {/* ── New template modal ────────────────────────────────── */}
      {showNewForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Nueva plantilla</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Nombre *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ej: Retail, Turismo..."
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Descripción (opcional)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                onClick={createTemplate}
                disabled={saving || !newName.trim()}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Creando..." : "Crear"}
              </button>
              <button
                onClick={() => { setShowNewForm(false); setError(null); setNewName(""); setNewDesc(""); }}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete template confirm ───────────────────────────── */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar plantilla?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar <strong>{deleteConfirm.name}</strong>? Las secciones específicas de esta plantilla también se eliminarán.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteTemplate(deleteConfirm)}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete section confirm ────────────────────────────── */}
      {deleteConfirmSection && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar sección?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar <strong>{deleteConfirmSection.title}</strong>? Los clientes que tengan esta sección asignada perderán sus respuestas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => deleteSection(deleteConfirmSection)}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button
                onClick={() => setDeleteConfirmSection(null)}
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
