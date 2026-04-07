"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type { OnboardingSection, OnboardingPart, PromptTemplate } from "@/lib/types";

interface SectionWithPart extends OnboardingSection {
  part: OnboardingPart;
}

interface TemplateRow {
  section: SectionWithPart;
  prompt: string;
  savedPrompt: string;
  saving: boolean;
}

const DEFAULT_PROMPT = `Empresa: {company_name}
Sección: {section_title}

Información del cliente:
{depured_text}`;

const VARIABLES = ["{company_name}", "{section_title}", "{depured_text}"];

export default function PromptsPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [savedFeedback, setSavedFeedback] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  const load = async () => {
    setLoading(true);
    const [{ data: parts }, { data: sections }, { data: templates }] =
      await Promise.all([
        supabase.from("onboarding_parts").select("*").order("part_number"),
        supabase.from("onboarding_sections").select("*").order("section_order"),
        supabase.from("prompt_templates").select("*"),
      ]);

    const partMap = new Map((parts ?? []).map((p) => [p.id, p]));
    const templateMap = new Map(
      (templates ?? [] as PromptTemplate[]).map((t) => [t.section_id, t.prompt])
    );

    // Only show template-specific sections (template_id IS NOT NULL)
    const withParts: SectionWithPart[] = (sections ?? [])
      .filter((s) => s.template_id !== null)
      .map((s) => ({ ...s, part: partMap.get(s.part_id)! }))
      .filter((s) => s.part);

    // Group: deduplicate by title within each part to avoid showing 6x the same section title
    // (Each template has its own section row. Show all of them.)
    const tableRows: TemplateRow[] = withParts.map((s) => {
      const saved = templateMap.get(s.id) ?? DEFAULT_PROMPT;
      return {
        section: s,
        prompt: saved,
        savedPrompt: saved,
        saving: false,
      };
    });

    setRows(tableRows);
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") load();
  }, [authLoading, profile]);

  const updatePrompt = (sectionId: number, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.section.id === sectionId ? { ...r, prompt: value } : r))
    );
  };

  const savePrompt = async (sectionId: number) => {
    const row = rows.find((r) => r.section.id === sectionId);
    if (!row) return;

    setRows((prev) =>
      prev.map((r) => (r.section.id === sectionId ? { ...r, saving: true } : r))
    );

    await supabase.from("prompt_templates").upsert(
      {
        section_id: sectionId,
        prompt: row.prompt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "section_id" }
    );

    setRows((prev) =>
      prev.map((r) =>
        r.section.id === sectionId
          ? { ...r, saving: false, savedPrompt: row.prompt }
          : r
      )
    );

    setSavedFeedback((prev) => ({ ...prev, [sectionId]: true }));
    setTimeout(
      () => setSavedFeedback((prev) => ({ ...prev, [sectionId]: false })),
      2000
    );
  };

  const resetToDefault = (sectionId: number) => {
    setRows((prev) =>
      prev.map((r) =>
        r.section.id === sectionId ? { ...r, prompt: DEFAULT_PROMPT } : r
      )
    );
  };

  // Group by template (via section.template_id)
  const grouped = rows.reduce<Record<number, TemplateRow[]>>((acc, row) => {
    const tid = row.section.template_id ?? 0;
    if (!acc[tid]) acc[tid] = [];
    acc[tid].push(row);
    return acc;
  }, {});

  if (authLoading || !user) return null;

  return (
    <div className="min-h-full bg-zinc-50">
      {/* Header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/pipeline"
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            ← Pipeline
          </Link>
          <span className="text-zinc-300">/</span>
          <h1 className="text-lg font-bold text-zinc-900">Plantillas de Prompts</h1>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Define el prompt que se usará cuando se envíen los datos a Pandai. Usa las variables{" "}
          {VARIABLES.map((v, i) => (
            <span key={v}>
              <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono text-blue-700">{v}</code>
              {i < VARIABLES.length - 1 ? ", " : ""}
            </span>
          ))}{" "}
          en tu plantilla.
        </p>
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">
              No hay secciones de plantillas configuradas todavía.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([tidStr, tidRows]) => {
              const firstRow = tidRows[0];
              // Get template name from section — we need to fetch it. For now show template_id.
              // We'll show section's part info instead.
              return (
                <div key={tidStr}>
                  <div className="space-y-2">
                    {tidRows.map((row) => {
                      const sectionId = row.section.id;
                      const isExpanded = expandedId === sectionId;
                      const isDirty = row.prompt !== row.savedPrompt;

                      return (
                        <div
                          key={sectionId}
                          className="overflow-hidden rounded-xl border border-zinc-200 bg-white"
                        >
                          {/* Row header */}
                          <div
                            className="flex cursor-pointer items-center justify-between px-5 py-3 hover:bg-zinc-50"
                            onClick={() =>
                              setExpandedId(isExpanded ? null : sectionId)
                            }
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`text-zinc-400 text-sm transition-transform ${isExpanded ? "rotate-90" : ""}`}
                              >
                                ▶
                              </span>
                              <div>
                                <p className="text-sm font-medium text-zinc-900">
                                  {row.section.title}
                                </p>
                                <p className="text-xs text-zinc-400">
                                  Parte {row.section.part.part_number} — {row.section.part.title}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isDirty && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                                  Sin guardar
                                </span>
                              )}
                              {savedFeedback[sectionId] && (
                                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                  ✓ Guardado
                                </span>
                              )}
                              {row.savedPrompt === DEFAULT_PROMPT ? (
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-400">
                                  Por defecto
                                </span>
                              ) : (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                                  Personalizado
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expanded editor */}
                          {isExpanded && (
                            <div className="border-t border-zinc-100 p-5">
                              <div className="mb-3 flex items-center gap-2">
                                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                                  Variables disponibles:
                                </p>
                                {VARIABLES.map((v) => (
                                  <button
                                    key={v}
                                    onClick={() =>
                                      updatePrompt(
                                        sectionId,
                                        row.prompt + v
                                      )
                                    }
                                    className="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs text-blue-700 hover:bg-blue-100"
                                    title={`Insertar ${v}`}
                                  >
                                    {v}
                                  </button>
                                ))}
                              </div>

                              <textarea
                                rows={10}
                                value={row.prompt}
                                onChange={(e) =>
                                  updatePrompt(sectionId, e.target.value)
                                }
                                className="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-zinc-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20"
                                placeholder={DEFAULT_PROMPT}
                              />

                              <div className="mt-3 flex gap-2">
                                <button
                                  onClick={() => savePrompt(sectionId)}
                                  disabled={row.saving}
                                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                                >
                                  {row.saving ? "Guardando..." : "Guardar plantilla"}
                                </button>
                                <button
                                  onClick={() => resetToDefault(sectionId)}
                                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                                >
                                  Restablecer por defecto
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
