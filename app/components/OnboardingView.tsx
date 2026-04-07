"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type {
  ClientSection,
  PartWithSections,
  SubmissionWithFiles,
} from "@/lib/types";
import SectionCard from "./SectionCard";

const PART_ICONS: Record<number, string> = {
  1: "🏢",
  2: "🧠",
  3: "🛠️",
  4: "💬",
};

interface Props {
  clientId: string;
  isAdmin: boolean;
  clientName?: string;
  refreshKey?: number;
}

function getSectionStatus(sub?: SubmissionWithFiles): "pending" | "submitted" | "validated" {
  if (!sub) return "pending";
  if (sub.admin_validated) return "validated";
  const hasContent =
    (sub.text_content && sub.text_content.trim()) ||
    (sub.submission_files && sub.submission_files.length > 0);
  return hasContent ? "submitted" : "pending";
}

export default function OnboardingView({ clientId, isAdmin, clientName, refreshKey }: Props) {
  const { user } = useAuth();
  const [parts, setParts] = useState<PartWithSections[]>([]);
  const [submissionsMap, setSubmissionsMap] = useState<Record<number, SubmissionWithFiles>>({});
  const [clientSections, setClientSections] = useState<ClientSection[]>([]);
  const [openParts, setOpenParts] = useState<Set<number>>(new Set([1]));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: partsData, error: partsErr } = await supabase
          .from("onboarding_parts")
          .select("*")
          .order("part_number");
        if (partsErr) throw partsErr;

        const { data: sectionsData, error: sectionsErr } = await supabase
          .from("onboarding_sections")
          .select("*")
          .order("section_order");
        if (sectionsErr) throw sectionsErr;

        // Fetch client section assignments
        const { data: csData } = await supabase
          .from("client_sections")
          .select("*")
          .eq("client_id", clientId)
          .order("display_order");
        const cs: ClientSection[] = csData ?? [];
        setClientSections(cs);

        // Build custom description map: section_id → custom_description
        const customDescMap = new Map<number, string | null>();
        for (const row of cs) customDescMap.set(row.section_id, row.custom_description);

        // If client has assignments, filter to only those sections;
        // otherwise show only legacy global sections (template_id IS NULL)
        const hasAssignments = cs.length > 0;
        const assignedIds = new Set(cs.map((row) => row.section_id));

        const sorted = (partsData ?? [])
          .map((p) => {
            let sections = (sectionsData ?? [])
              .filter((s) => s.part_id === p.id)
              .sort((a, b) => a.section_order - b.section_order);

            if (hasAssignments) {
              sections = sections
                .filter((s) => assignedIds.has(s.id))
                // Apply custom description when set
                .map((s) => ({
                  ...s,
                  description: customDescMap.get(s.id) ?? s.description,
                }));
            } else {
              // Backward compat: legacy clients see only global sections (no template)
              sections = sections.filter((s) => s.template_id === null);
            }
            return { ...p, sections };
          })
          .filter((p) => p.sections.length > 0);

        setParts(sorted);

        const { data: subsData, error: subsErr } = await supabase
          .from("submissions")
          .select("*, submission_files(*)")
          .eq("client_id", clientId);
        if (subsErr) throw subsErr;

        const map: Record<number, SubmissionWithFiles> = {};
        for (const sub of subsData ?? []) map[sub.section_id] = sub;
        setSubmissionsMap(map);
      } catch {
        setError("Error al cargar los datos. Recarga la página.");
      } finally {
        setLoading(false);
      }
    };

    if (clientId) load();
  }, [clientId, refreshKey]);

  const handleUpdate = (sectionId: number, updated: SubmissionWithFiles) => {
    setSubmissionsMap((prev) => ({ ...prev, [sectionId]: updated }));
  };

  const togglePart = (partNumber: number) => {
    setOpenParts((prev) => {
      const next = new Set(prev);
      next.has(partNumber) ? next.delete(partNumber) : next.add(partNumber);
      return next;
    });
  };

  const totalSections = clientSections.length > 0 ? clientSections.length : parts.reduce((acc, p) => acc + p.sections.length, 0);
  const completedSections = Object.values(submissionsMap).filter((s) => getSectionStatus(s) !== "pending").length;
  const validatedSections = Object.values(submissionsMap).filter((s) => getSectionStatus(s) === "validated").length;
  const progressPercent = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0;

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="text-sm text-zinc-500">Cargando secciones...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }

  // Client with no assigned sections yet
  if (!isAdmin && clientSections.length === 0 && parts.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-8 text-center">
          <p className="text-3xl">⚙️</p>
          <h1 className="mt-4 text-lg font-bold text-zinc-900">
            Tu espacio de onboarding está siendo configurado
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Te notificaremos cuando esté listo para que puedas comenzar.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Welcome / intro */}
      {!isAdmin ? (
        <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6">
          <h1 className="text-xl font-bold text-zinc-900">
            Bienvenido a tu proceso de onboarding 👋
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Este portal es donde nos entregarás toda la información que necesitamos
            para configurar y entrenar tu asistente de inteligencia artificial.
            Completa cada sección con la mayor cantidad de detalle posible — mientras
            más información, mejor será el rendimiento de tu agente.
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            Puedes guardar tu progreso en cualquier momento y volver más tarde.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">
          <h1 className="text-lg font-bold text-zinc-900">
            Onboarding de {clientName ?? clientId}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Vista administrativa — puedes editar y subir archivos en nombre del cliente.
          </p>
        </div>
      )}

      {/* Progress bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700">Progreso general</span>
          <span className="text-sm font-semibold text-zinc-900">
            {completedSections}/{totalSections} secciones completadas
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div
            className="h-full rounded-full bg-blue-600 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex gap-4 text-xs text-zinc-500">
          <span>📤 {completedSections} enviadas</span>
          <span>✅ {validatedSections} validadas</span>
          <span>⏳ {totalSections - completedSections} pendientes</span>
        </div>
      </div>

      {/* Parts */}
      {parts.map((part) => {
        const isOpen = openParts.has(part.part_number);
        const partSections = part.sections ?? [];
        const partCompleted = partSections.filter(
          (s) => getSectionStatus(submissionsMap[s.id]) !== "pending"
        ).length;

        return (
          <div key={part.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <button
              onClick={() => togglePart(part.part_number)}
              className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-zinc-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{PART_ICONS[part.part_number] ?? "📋"}</span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
                    Parte {part.part_number}
                  </p>
                  <h2 className="font-semibold text-zinc-900">{part.title}</h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-500">{partCompleted}/{partSections.length}</span>
                <span className={`text-zinc-400 transition-transform ${isOpen ? "rotate-180" : ""}`}>▾</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-zinc-100">
                <div className="bg-amber-50 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-700">¿Por qué te pedimos esto?</p>
                  <p className="mt-1 text-sm leading-relaxed text-amber-800">{part.why_we_ask}</p>
                </div>
                <div className="space-y-4 p-5">
                  {partSections.map((section) => (
                    <SectionCard
                      key={section.id}
                      section={section}
                      clientId={clientId}
                      currentUserId={user?.id ?? ""}
                      isAdmin={isAdmin}
                      initialSubmission={submissionsMap[section.id]}
                      onUpdate={handleUpdate}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Disclaimer */}
      {!isAdmin && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
          <p className="text-xs leading-relaxed text-zinc-500">
            🔒 <strong>Confidencialidad:</strong> La información que compartes aquí es utilizada exclusivamente
            para configurar y entrenar tu asistente de inteligencia artificial. Tus datos son tratados de forma
            confidencial y segura.
          </p>
        </div>
      )}
    </div>
  );
}
