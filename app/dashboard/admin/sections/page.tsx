"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { OnboardingPart, OnboardingSection, PartWithSections } from "@/lib/types";

export default function ManageSectionsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [parts, setParts] = useState<PartWithSections[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Part modal
  const [partModal, setPartModal] = useState<Partial<OnboardingPart> | null>(null);
  // Section modal
  const [sectionModal, setSectionModal] = useState<Partial<OnboardingSection> & { _newPartId?: number } | null>(null);
  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "part" | "section"; id: number; label: string } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const load = async () => {
    setLoading(true);
    const { data: partsData } = await supabase.from("onboarding_parts").select("*").order("part_number");
    const { data: sectionsData } = await supabase.from("onboarding_sections").select("*").order("section_order");
    const merged: PartWithSections[] = (partsData ?? []).map((p) => ({
      ...p,
      sections: (sectionsData ?? []).filter((s) => s.part_id === p.id).sort((a, b) => a.section_order - b.section_order),
    }));
    setParts(merged);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") load();
  }, [authLoading, profile]);

  // ── Part mutations ──────────────────────────────────────────

  const savePart = async () => {
    if (!partModal) return;
    setSaving(true);
    setError(null);
    if (partModal.id) {
      const { error: err } = await supabase
        .from("onboarding_parts")
        .update({ title: partModal.title, why_we_ask: partModal.why_we_ask, part_number: partModal.part_number })
        .eq("id", partModal.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase
        .from("onboarding_parts")
        .insert({ title: partModal.title, why_we_ask: partModal.why_we_ask ?? "", part_number: partModal.part_number ?? 0 });
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setPartModal(null);
    await load();
  };

  const deletePart = async (id: number) => {
    setDeleteError(null);
    // Check if any sections exist under this part
    const part = parts.find((p) => p.id === id);
    if (part && part.sections.length > 0) {
      setDeleteError("No puedes eliminar una parte que tiene secciones. Elimina primero las secciones.");
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from("onboarding_parts").delete().eq("id", id);
    setSaving(false);
    if (err) { setDeleteError(err.message); return; }
    setDeleteConfirm(null);
    await load();
  };

  // ── Section mutations ───────────────────────────────────────

  const saveSection = async () => {
    if (!sectionModal) return;
    setSaving(true);
    setError(null);
    const partId = sectionModal.part_id ?? sectionModal._newPartId;
    if (sectionModal.id) {
      const { error: err } = await supabase
        .from("onboarding_sections")
        .update({ title: sectionModal.title, description: sectionModal.description, part_id: sectionModal.part_id, section_order: sectionModal.section_order })
        .eq("id", sectionModal.id);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      // Compute next order within the part
      const part = parts.find((p) => p.id === partId);
      const maxOrder = part ? Math.max(0, ...part.sections.map((s) => s.section_order)) : 0;
      const { error: err } = await supabase
        .from("onboarding_sections")
        .insert({ title: sectionModal.title, description: sectionModal.description ?? "", part_id: partId, section_order: maxOrder + 1 });
      if (err) { setError(err.message); setSaving(false); return; }
    }
    setSaving(false);
    setSectionModal(null);
    await load();
  };

  const deleteSection = async (id: number) => {
    setDeleteError(null);
    // Check for submissions
    const { count } = await supabase.from("submissions").select("id", { count: "exact", head: true }).eq("section_id", id);
    if (count && count > 0) {
      setDeleteError(`No puedes eliminar esta sección — ${count} cliente(s) tienen respuestas aquí.`);
      return;
    }
    setSaving(true);
    const { error: err } = await supabase.from("onboarding_sections").delete().eq("id", id);
    setSaving(false);
    if (err) { setDeleteError(err.message); return; }
    setDeleteConfirm(null);
    await load();
  };

  const moveSection = async (partId: number, sectionId: number, direction: "up" | "down") => {
    const part = parts.find((p) => p.id === partId);
    if (!part) return;
    const idx = part.sections.findIndex((s) => s.id === sectionId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= part.sections.length) return;

    const a = part.sections[idx];
    const b = part.sections[swapIdx];
    await supabase.from("onboarding_sections").update({ section_order: b.section_order }).eq("id", a.id);
    await supabase.from("onboarding_sections").update({ section_order: a.section_order }).eq("id", b.id);
    await load();
  };

  if (authLoading || !user) return null;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Gestionar Secciones</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Añade, edita y reordena partes y secciones del onboarding.</p>
        </div>
        <button
          onClick={() => setPartModal({ title: "", why_we_ask: "", part_number: (parts.length ? Math.max(...parts.map((p) => p.part_number)) + 1 : 1) })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Añadir parte
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-4">
          {parts.map((part) => (
            <div key={part.id} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              {/* Part header */}
              <div className="flex items-center justify-between bg-zinc-50 px-5 py-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Parte {part.part_number}</span>
                  <h2 className="font-semibold text-zinc-900">{part.title}</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPartModal({ ...part })}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => { setDeleteConfirm({ type: "part", id: part.id, label: part.title }); setDeleteError(null); }}
                    className="rounded-lg border border-red-100 bg-white px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              {/* Sections */}
              <div className="divide-y divide-zinc-100">
                {part.sections.map((section, idx) => (
                  <div key={section.id} className="flex items-center gap-3 px-5 py-3">
                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => moveSection(part.id, section.id, "up")}
                        disabled={idx === 0}
                        className="rounded p-0.5 text-xs text-zinc-300 hover:text-zinc-600 disabled:opacity-20"
                      >▲</button>
                      <button
                        onClick={() => moveSection(part.id, section.id, "down")}
                        disabled={idx === part.sections.length - 1}
                        className="rounded p-0.5 text-xs text-zinc-300 hover:text-zinc-600 disabled:opacity-20"
                      >▼</button>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-zinc-900">{section.title}</p>
                      <p className="truncate text-xs text-zinc-400">{section.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setSectionModal({ ...section })}
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => { setDeleteConfirm({ type: "section", id: section.id, label: section.title }); setDeleteError(null); }}
                        className="rounded-lg border border-red-100 bg-white px-3 py-1 text-xs font-medium text-red-500 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
                <div className="px-5 py-3">
                  <button
                    onClick={() => setSectionModal({ title: "", description: "", part_id: part.id, _newPartId: part.id })}
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    + Añadir sección
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Part modal */}
      {partModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              {partModal.id ? "Editar parte" : "Añadir parte"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Número de orden</label>
                <input type="number" value={partModal.part_number ?? ""} onChange={(e) => setPartModal((p) => ({ ...p!, part_number: +e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Título</label>
                <input type="text" value={partModal.title ?? ""} onChange={(e) => setPartModal((p) => ({ ...p!, title: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">¿Por qué lo pedimos?</label>
                <textarea rows={3} value={partModal.why_we_ask ?? ""} onChange={(e) => setPartModal((p) => ({ ...p!, why_we_ask: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={savePart} disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => { setPartModal(null); setError(null); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section modal */}
      {sectionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">
              {sectionModal.id ? "Editar sección" : "Añadir sección"}
            </h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Parte</label>
                <select value={sectionModal.part_id ?? sectionModal._newPartId ?? ""} onChange={(e) => setSectionModal((s) => ({ ...s!, part_id: +e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500">
                  {parts.map((p) => <option key={p.id} value={p.id}>Parte {p.part_number} — {p.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Título</label>
                <input type="text" value={sectionModal.title ?? ""} onChange={(e) => setSectionModal((s) => ({ ...s!, title: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-zinc-700">Descripción</label>
                <textarea rows={3} value={sectionModal.description ?? ""} onChange={(e) => setSectionModal((s) => ({ ...s!, description: e.target.value }))}
                  className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              {sectionModal.id && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">Orden</label>
                  <input type="number" value={sectionModal.section_order ?? ""} onChange={(e) => setSectionModal((s) => ({ ...s!, section_order: +e.target.value }))}
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20" />
                </div>
              )}
            </div>
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button onClick={saveSection} disabled={saving} className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button onClick={() => { setSectionModal(null); setError(null); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold text-zinc-900">¿Eliminar?</h2>
            <p className="mb-4 text-sm text-zinc-500">
              ¿Seguro que quieres eliminar <strong>{deleteConfirm.label}</strong>? Esta acción no se puede deshacer.
            </p>
            {deleteError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => deleteConfirm.type === "part" ? deletePart(deleteConfirm.id) : deleteSection(deleteConfirm.id)}
                disabled={saving}
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? "Eliminando..." : "Eliminar"}
              </button>
              <button onClick={() => { setDeleteConfirm(null); setDeleteError(null); }} className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
