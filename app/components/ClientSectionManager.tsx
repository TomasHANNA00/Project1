"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ClientSection, OnboardingSection, OnboardingTemplate, PartWithSections, TemplateSection } from "@/lib/types";

interface Props {
  clientId: string;
  onUpdate: () => void;
}

export default function ClientSectionManager({ clientId, onUpdate }: Props) {
  const [clientSections, setClientSections] = useState<ClientSection[]>([]);
  const [allParts, setAllParts] = useState<PartWithSections[]>([]);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [currentTemplateId, setCurrentTemplateId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Add section dropdown
  const [showAddSection, setShowAddSection] = useState(false);

  // Change template modal
  const [showChangeTemplate, setShowChangeTemplate] = useState(false);
  const [newTemplateId, setNewTemplateId] = useState<number | "">("");
  const [templateSections, setTemplateSections] = useState<TemplateSection[]>([]);
  // Full section objects for the template being previewed in the modal
  const [templateSectionDetails, setTemplateSectionDetails] = useState<OnboardingSection[]>([]);
  // Parts organised for the preview template
  const [templatePreviewParts, setTemplatePreviewParts] = useState<PartWithSections[]>([]);
  const [selectedSectionIds, setSelectedSectionIds] = useState<Set<number>>(new Set());

  const load = async () => {
    setLoading(true);
    const [{ data: cs }, { data: pData }, { data: sData }, { data: tData }, { data: profileData }] = await Promise.all([
      supabase.from("client_sections").select("*").eq("client_id", clientId).order("display_order"),
      supabase.from("onboarding_parts").select("*").order("part_number"),
      supabase.from("onboarding_sections").select("*").order("section_order"),
      supabase.from("onboarding_templates").select("*").order("id"),
      supabase.from("profiles").select("template_id").eq("id", clientId).single(),
    ]);
    const templateId = profileData?.template_id ?? null;
    const relevantSections = (sData ?? []).filter(
      (s) => s.template_id === null || s.template_id === templateId
    );
    const merged: PartWithSections[] = (pData ?? [])
      .map((p) => ({
        ...p,
        sections: relevantSections
          .filter((s) => s.part_id === p.id)
          .sort((a, b) => a.section_order - b.section_order),
      }))
      .filter((p) => p.sections.length > 0);
    setClientSections(cs ?? []);
    setAllParts(merged);
    setTemplates(tData ?? []);
    setCurrentTemplateId(templateId);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const removeSection = async (cs: ClientSection) => {
    const { count } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("section_id", cs.section_id);
    if (count && count > 0) {
      if (!confirm(`Esta sección tiene ${count} respuesta(s). ¿Quitar de todas formas?`)) return;
    }
    setSaving(true);
    await supabase.from("client_sections").delete().eq("id", cs.id);
    setSaving(false);
    await load();
    onUpdate();
  };

  const addSection = async (section: OnboardingSection) => {
    setSaving(true);
    const maxOrder = clientSections.length > 0
      ? Math.max(...clientSections.map((cs) => cs.display_order))
      : 0;
    await supabase.from("client_sections").insert({
      client_id: clientId,
      section_id: section.id,
      custom_description: null,
      display_order: maxOrder + 1,
    });
    setSaving(false);
    setShowAddSection(false);
    await load();
    onUpdate();
  };

  const openChangeTemplate = async (templateId: number | "") => {
    setNewTemplateId(templateId);
    if (!templateId) {
      setTemplateSections([]);
      setTemplateSectionDetails([]);
      setTemplatePreviewParts([]);
      setSelectedSectionIds(new Set());
      return;
    }
    // Load template_sections + section details + parts for this template
    const [{ data: ts }, { data: sData }, { data: pData }] = await Promise.all([
      supabase.from("template_sections").select("*").eq("template_id", templateId),
      supabase.from("onboarding_sections").select("*").eq("template_id", templateId).order("section_order"),
      supabase.from("onboarding_parts").select("*").order("part_number"),
    ]);
    const sections = sData ?? [];
    const tSections = ts ?? [];
    setTemplateSections(tSections);
    setTemplateSectionDetails(sections);
    setSelectedSectionIds(new Set(tSections.map((s) => s.section_id)));

    const sectionMap = new Map(sections.map((s) => [s.id, s]));
    const preview: PartWithSections[] = (pData ?? [])
      .map((p) => ({
        ...p,
        sections: sections
          .filter((s) => s.part_id === p.id)
          .sort((a, b) => a.section_order - b.section_order),
      }))
      .filter((p) => p.sections.length > 0);
    setTemplatePreviewParts(preview);
    void sectionMap;
  };

  const applyTemplate = async () => {
    setSaving(true);
    await supabase.from("client_sections").delete().eq("client_id", clientId);
    if (newTemplateId && selectedSectionIds.size > 0) {
      const rows = templateSections
        .filter((ts) => selectedSectionIds.has(ts.section_id))
        .map((ts) => ({
          client_id: clientId,
          section_id: ts.section_id,
          custom_description: ts.custom_description,
          display_order: ts.display_order,
        }));
      if (rows.length > 0) {
        await supabase.from("client_sections").insert(rows);
      }
    }
    await supabase.from("profiles").update({ template_id: newTemplateId || null }).eq("id", clientId);
    setSaving(false);
    setShowChangeTemplate(false);
    await load();
    onUpdate();
  };

  const assignedSectionIds = new Set(clientSections.map((cs) => cs.section_id));
  const unassignedSections = allParts.flatMap((p) => p.sections).filter((s) => !assignedSectionIds.has(s.id));
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);

  const sectionById = new Map<number, OnboardingSection>();
  for (const p of allParts) for (const s of p.sections) sectionById.set(s.id, s);

  if (loading) return null;

  return (
    <div className="border-b border-zinc-200 bg-zinc-50 px-6 py-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Admin</span>
          <span className="text-zinc-200">|</span>
          <span className="text-sm font-semibold text-zinc-700">Secciones asignadas</span>
          {currentTemplate ? (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              🗂️ {currentTemplate.name}
            </span>
          ) : clientSections.length === 0 ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
              Sin plantilla — mostrando todas
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowChangeTemplate(true); openChangeTemplate(currentTemplateId ?? ""); }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
          >
            Cambiar plantilla
          </button>
          {unassignedSections.length > 0 && (
            <button
              onClick={() => setShowAddSection(!showAddSection)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              + Añadir sección
            </button>
          )}
        </div>
      </div>

      {/* Assigned section chips */}
      {clientSections.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {clientSections.map((cs) => {
            const section = sectionById.get(cs.section_id);
            if (!section) return null;
            return (
              <div
                key={cs.id}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs"
              >
                <span className="text-zinc-700">{section.title}</span>
                <button
                  onClick={() => removeSection(cs)}
                  disabled={saving}
                  className="text-zinc-300 hover:text-red-500 disabled:opacity-40"
                  title="Quitar"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add section dropdown */}
      {showAddSection && (
        <div className="mt-2 max-h-52 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-md">
          {allParts.map((part) => {
            const avail = part.sections.filter((s) => !assignedSectionIds.has(s.id));
            if (!avail.length) return null;
            return (
              <div key={part.id}>
                <p className="bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {part.title}
                </p>
                {avail.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => addSection(section)}
                    disabled={saving}
                    className="flex w-full items-center px-4 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {section.title}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Change template modal */}
      {showChangeTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Asignar plantilla</h2>
            <p className="mb-4 text-sm text-zinc-500">
              Elige la plantilla y selecciona qué secciones mostrar a este cliente.
            </p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Plantilla</label>
              <select
                value={newTemplateId}
                onChange={(e) => openChangeTemplate(e.target.value ? +e.target.value : "")}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Sin plantilla (sin secciones)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {newTemplateId && templatePreviewParts.length > 0 && (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-700">Secciones a mostrar</p>
                  <span className="text-xs text-zinc-400">{selectedSectionIds.size} seleccionadas</span>
                </div>
                <div className="max-h-52 overflow-auto rounded-xl border border-zinc-100 bg-zinc-50 p-2 space-y-3">
                  {templatePreviewParts.map((part) => {
                    const partSections = part.sections.filter((s) =>
                      templateSections.some((ts) => ts.section_id === s.id)
                    );
                    if (!partSections.length) return null;
                    return (
                      <div key={part.id}>
                        <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                          Parte {part.part_number} — {part.title}
                        </p>
                        <div className="space-y-0.5">
                          {partSections.map((section) => (
                            <label
                              key={section.id}
                              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
                            >
                              <input
                                type="checkbox"
                                checked={selectedSectionIds.has(section.id)}
                                onChange={() =>
                                  setSelectedSectionIds((prev) => {
                                    const next = new Set(prev);
                                    next.has(section.id) ? next.delete(section.id) : next.add(section.id);
                                    return next;
                                  })
                                }
                                className="h-4 w-4 rounded border-zinc-300 text-blue-600"
                              />
                              <span className="text-sm text-zinc-700">{section.title}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={applyTemplate}
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Aplicando..." : "Aplicar"}
              </button>
              <button
                onClick={() => setShowChangeTemplate(false)}
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
