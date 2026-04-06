"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { OnboardingTemplate, TemplateSection, PartWithSections } from "@/lib/types";

export default function TemplatesPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [parts, setParts] = useState<PartWithSections[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Selected template for editing
  const [selected, setSelected] = useState<OnboardingTemplate | null>(null);
  const [selectedSections, setSelectedSections] = useState<TemplateSection[]>([]);
  // Editable fields
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  // Custom descriptions per section_id
  const [customDescs, setCustomDescs] = useState<Record<number, string>>({});
  // Which section_ids are checked
  const [checkedIds, setCheckedIds] = useState<Set<number>>(new Set());

  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<OnboardingTemplate | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const loadAll = async () => {
    setLoading(true);
    const { data: tData } = await supabase.from("onboarding_templates").select("*").order("id");
    const { data: pData } = await supabase.from("onboarding_parts").select("*").order("part_number");
    const { data: sData } = await supabase.from("onboarding_sections").select("*").order("section_order");
    const merged: PartWithSections[] = (pData ?? []).map((p) => ({
      ...p,
      sections: (sData ?? []).filter((s) => s.part_id === p.id).sort((a, b) => a.section_order - b.section_order),
    }));
    setTemplates(tData ?? []);
    setParts(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") loadAll();
  }, [authLoading, profile]);

  const openTemplate = async (t: OnboardingTemplate) => {
    setSelected(t);
    setEditName(t.name);
    setEditDesc(t.description ?? "");
    setError(null);
    const { data: ts } = await supabase
      .from("template_sections")
      .select("*")
      .eq("template_id", t.id);
    const sections = ts ?? [];
    setSelectedSections(sections);
    setCheckedIds(new Set(sections.map((s) => s.section_id)));
    const descs: Record<number, string> = {};
    for (const s of sections) {
      if (s.custom_description) descs[s.section_id] = s.custom_description;
    }
    setCustomDescs(descs);
  };

  const saveTemplate = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);

    const { error: nameErr } = await supabase
      .from("onboarding_templates")
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq("id", selected.id);
    if (nameErr) { setError(nameErr.message); setSaving(false); return; }

    // Rebuild template_sections: delete all then re-insert checked ones
    await supabase.from("template_sections").delete().eq("template_id", selected.id);

    if (checkedIds.size > 0) {
      const allSections = parts.flatMap((p) => p.sections);
      const rows = allSections
        .filter((s) => checkedIds.has(s.id))
        .map((s) => ({
          template_id: selected.id,
          section_id: s.id,
          custom_description: customDescs[s.id]?.trim() || null,
          display_order: s.section_order,
        }));
      const { error: insertErr } = await supabase.from("template_sections").insert(rows);
      if (insertErr) { setError(insertErr.message); setSaving(false); return; }
    }

    setSaving(false);
    await loadAll();
    // Refresh selected
    const updated = { ...selected, name: editName.trim(), description: editDesc.trim() || null };
    setSelected(updated);
    setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
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
    setNewName("");
    setNewDesc("");
    await loadAll();
    if (data) openTemplate(data);
  };

  const deleteTemplate = async (t: OnboardingTemplate) => {
    setSaving(true);
    await supabase.from("onboarding_templates").delete().eq("id", t.id);
    setSaving(false);
    setDeleteConfirm(null);
    if (selected?.id === t.id) setSelected(null);
    await loadAll();
  };

  const toggleSection = (sectionId: number) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(sectionId) ? next.delete(sectionId) : next.add(sectionId);
      return next;
    });
  };

  if (authLoading || !user) return null;

  const allSectionsCount = parts.reduce((acc, p) => acc + p.sections.length, 0);

  return (
    <div className="flex h-full">
      {/* Left panel: template list */}
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
                  <button
                    onClick={() => openTemplate(t)}
                    className={`group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors ${
                      isActive ? "bg-blue-50 text-blue-700" : "text-zinc-700 hover:bg-zinc-100"
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm(t); }}
                      className="hidden rounded p-1 text-zinc-300 hover:text-red-500 group-hover:block"
                    >
                      🗑
                    </button>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Right panel: template editor */}
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
            </div>

            {/* Section selection */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-zinc-900">Secciones incluidas</h2>
                <span className="text-sm text-zinc-500">{checkedIds.size}/{allSectionsCount} seleccionadas</span>
              </div>
              <div className="space-y-4">
                {parts.map((part) => (
                  <div key={part.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                      Parte {part.part_number} — {part.title}
                    </p>
                    <div className="space-y-2">
                      {part.sections.map((section) => {
                        const checked = checkedIds.has(section.id);
                        return (
                          <div key={section.id} className={`rounded-lg border p-3 transition-colors ${checked ? "border-blue-200 bg-blue-50" : "border-zinc-100 bg-zinc-50"}`}>
                            <label className="flex cursor-pointer items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSection(section.id)}
                                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600"
                              />
                              <div className="flex-1">
                                <p className="text-sm font-medium text-zinc-900">{section.title}</p>
                                <p className="text-xs text-zinc-500">{section.description}</p>
                              </div>
                            </label>
                            {checked && (
                              <div className="mt-2 pl-7">
                                <label className="mb-1 block text-xs font-medium text-zinc-500">
                                  Descripción personalizada para esta plantilla (opcional)
                                </label>
                                <textarea
                                  rows={2}
                                  value={customDescs[section.id] ?? ""}
                                  onChange={(e) => setCustomDescs((prev) => ({ ...prev, [section.id]: e.target.value }))}
                                  placeholder="Deja en blanco para usar la descripción por defecto"
                                  className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

            <button
              onClick={saveTemplate}
              disabled={saving}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar plantilla"}
            </button>
          </div>
        )}
      </div>

      {/* New template modal */}
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
                  placeholder="Ej: Salud, E-commerce..."
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
              <button onClick={createTemplate} disabled={saving || !newName.trim()} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Creando..." : "Crear"}
              </button>
              <button onClick={() => { setShowNewForm(false); setError(null); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar plantilla?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar <strong>{deleteConfirm.name}</strong>? Los clientes asignados a esta plantilla no perderán sus secciones.
            </p>
            <div className="flex gap-3">
              <button onClick={() => deleteTemplate(deleteConfirm)} disabled={saving} className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
