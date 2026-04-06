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
    const merged: PartWithSections[] = (pData ?? []).map((p) => ({
      ...p,
      sections: (sData ?? []).filter((s) => s.part_id === p.id).sort((a, b) => a.section_order - b.section_order),
    }));
    setClientSections(cs ?? []);
    setAllParts(merged);
    setTemplates(tData ?? []);
    setCurrentTemplateId(profileData?.template_id ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); }, [clientId]);

  const removeSection = async (cs: ClientSection) => {
    // Warn if section has submissions
    const { count } = await supabase
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("section_id", cs.section_id);

    if (count && count > 0) {
      if (!confirm(`Esta sección tiene ${count} respuesta(s). ¿Eliminar de todas formas?`)) return;
    }
    setSaving(true);
    await supabase.from("client_sections").delete().eq("id", cs.id);
    setSaving(false);
    await load();
    onUpdate();
  };

  const addSection = async (section: OnboardingSection) => {
    setSaving(true);
    await supabase.from("client_sections").insert({
      client_id: clientId,
      section_id: section.id,
      custom_description: null,
      display_order: section.section_order,
    });
    setSaving(false);
    setShowAddSection(false);
    await load();
    onUpdate();
  };

  const openChangeTemplate = async (templateId: number | "") => {
    setNewTemplateId(templateId);
    if (!templateId) { setTemplateSections([]); setSelectedSectionIds(new Set()); return; }
    const { data: ts } = await supabase.from("template_sections").select("*").eq("template_id", templateId);
    setTemplateSections(ts ?? []);
    setSelectedSectionIds(new Set((ts ?? []).map((s) => s.section_id)));
  };

  const applyTemplate = async () => {
    setSaving(true);
    // Delete all existing client_sections
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

    // Update profile template_id
    await supabase.from("profiles").update({ template_id: newTemplateId || null }).eq("id", clientId);

    setSaving(false);
    setShowChangeTemplate(false);
    await load();
    onUpdate();
  };

  const assignedSectionIds = new Set(clientSections.map((cs) => cs.section_id));
  const unassignedSections = allParts.flatMap((p) => p.sections).filter((s) => !assignedSectionIds.has(s.id));
  const currentTemplate = templates.find((t) => t.id === currentTemplateId);

  // Build a lookup from section_id to section info
  const sectionById = new Map<number, OnboardingSection>();
  for (const p of allParts) for (const s of p.sections) sectionById.set(s.id, s);

  if (loading) return null;

  return (
    <div className="border-b border-zinc-200 bg-white px-6 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-zinc-900">Secciones asignadas</h3>
          {currentTemplate && (
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              🗂️ {currentTemplate.name}
            </span>
          )}
          {!currentTemplate && clientSections.length === 0 && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs text-zinc-500">
              Sin asignar — mostrando todas las secciones
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowChangeTemplate(true); openChangeTemplate(currentTemplateId ?? ""); }}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
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

      {/* Assigned sections chips */}
      {clientSections.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clientSections.map((cs) => {
            const section = sectionById.get(cs.section_id);
            if (!section) return null;
            return (
              <div key={cs.id} className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs">
                <span className="text-zinc-700">{section.title}</span>
                <button
                  onClick={() => removeSection(cs)}
                  disabled={saving}
                  className="text-zinc-300 hover:text-red-500 disabled:opacity-40"
                  title="Quitar sección"
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
        <div className="mt-2 max-h-48 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-md">
          {allParts.map((part) => {
            const avail = part.sections.filter((s) => !assignedSectionIds.has(s.id));
            if (!avail.length) return null;
            return (
              <div key={part.id}>
                <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 bg-zinc-50">
                  Parte {part.part_number} — {part.title}
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
            <h2 className="mb-1 text-lg font-semibold text-zinc-900">Cambiar plantilla</h2>
            <p className="mb-4 text-sm text-zinc-500">Seleccionar una nueva plantilla reemplazará las secciones asignadas.</p>

            <div className="mb-4">
              <label className="mb-1 block text-sm font-medium text-zinc-700">Plantilla</label>
              <select
                value={newTemplateId}
                onChange={(e) => openChangeTemplate(e.target.value ? +e.target.value : "")}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Sin plantilla (sin secciones asignadas)</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>

            {newTemplateId && templateSections.length > 0 && (
              <div className="mb-4">
                <p className="mb-2 text-sm font-medium text-zinc-700">Secciones a asignar ({selectedSectionIds.size})</p>
                <div className="max-h-48 overflow-auto rounded-lg border border-zinc-100 bg-zinc-50 p-2 space-y-1">
                  {allParts.map((part) => {
                    const partSections = templateSections.filter(
                      (ts) => part.sections.some((s) => s.id === ts.section_id)
                    );
                    if (!partSections.length) return null;
                    return (
                      <div key={part.id}>
                        <p className="py-1 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                          {part.title}
                        </p>
                        {partSections.map((ts) => {
                          const sec = sectionById.get(ts.section_id);
                          return (
                            <label key={ts.section_id} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-white cursor-pointer">
                              <input
                                type="checkbox"
                                checked={selectedSectionIds.has(ts.section_id)}
                                onChange={() => setSelectedSectionIds((prev) => {
                                  const next = new Set(prev);
                                  next.has(ts.section_id) ? next.delete(ts.section_id) : next.add(ts.section_id);
                                  return next;
                                })}
                                className="h-3.5 w-3.5 rounded border-zinc-300 text-blue-600"
                              />
                              <span className="text-sm text-zinc-700">{sec?.title}</span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={applyTemplate} disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Aplicando..." : "Aplicar"}
              </button>
              <button onClick={() => setShowChangeTemplate(false)} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
