"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import type {
  Profile,
  OnboardingSection,
  OnboardingPart,
  SubmissionWithFiles,
  SubmissionFile,
  PipelineItem,
} from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

type PipelineStatus = "sin_datos" | "datos_recibidos" | "depurado" | "enviado";

interface SectionRow {
  section: OnboardingSection;
  part: OnboardingPart;
  submission: SubmissionWithFiles | null;
  pipelineItem: PipelineItem | null;
}

interface ClientOption extends Profile {
  templateName: string | null;
}

interface OverviewStats {
  clientsWithPending: number;
  sectionsDepuredNotSent: number;
  totalEnviado: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getPipelineStatus(row: SectionRow): PipelineStatus {
  if (row.pipelineItem?.status === "enviado") return "enviado";
  if (row.pipelineItem?.status === "depurado") return "depurado";
  const sub = row.submission;
  if (sub && (sub.text_content?.trim() || sub.submission_files?.length > 0))
    return "datos_recibidos";
  return "sin_datos";
}

const STATUS_LABEL: Record<PipelineStatus, string> = {
  sin_datos: "Sin datos",
  datos_recibidos: "Datos recibidos",
  depurado: "Depurado",
  enviado: "Enviado",
};

const STATUS_STYLE: Record<PipelineStatus, string> = {
  sin_datos: "bg-zinc-100 text-zinc-500",
  datos_recibidos: "bg-blue-100 text-blue-700",
  depurado: "bg-green-100 text-green-700",
  enviado: "bg-purple-100 text-purple-700",
};

function formatBytes(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// ── Main component ─────────────────────────────────────────────────────────

export default function PipelinePage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  // Overview
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loadingOverview, setLoadingOverview] = useState(true);

  // Selected client
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [clientProfile, setClientProfile] = useState<ClientOption | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loadingClient, setLoadingClient] = useState(false);

  // Per-section editable depured text
  const [depuredTexts, setDepuredTexts] = useState<Record<number, string>>({});
  // AI depuration in-progress per section
  const [depuring, setDepuring] = useState<Set<number>>(new Set());
  // Save in-progress per section
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  // Errors per section
  const [sectionErrors, setSectionErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  // ── Load overview ────────────────────────────────────────────────────────

  const loadOverview = useCallback(async () => {
    setLoadingOverview(true);

    const [{ data: profiles }, { data: templates }, { data: pipeline }] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("*")
          .eq("role", "client")
          .order("created_at"),
        supabase.from("onboarding_templates").select("id, name"),
        supabase.from("pipeline_items").select("client_id, section_id, status"),
      ]);

    const templateMap = new Map((templates ?? []).map((t) => [t.id, t.name]));

    const clientOptions: ClientOption[] = (profiles ?? []).map((p) => ({
      ...p,
      templateName: p.template_id ? (templateMap.get(p.template_id) ?? null) : null,
    }));
    setClients(clientOptions);

    // Stats
    const depItems = (pipeline ?? []).filter((p) => p.status === "depurado");
    const envItems = (pipeline ?? []).filter((p) => p.status === "enviado");
    const depuredSet = new Set(
      [...depItems, ...envItems].map((p) => `${p.client_id}_${p.section_id}`)
    );

    // clients with pending = clients that have submissions but not all depured
    // Approximate: clients that appear in submissions but not fully in pipeline
    const { data: submissionsRaw } = await supabase
      .from("submissions")
      .select("client_id, section_id, text_content");
    const subsWithContent = (submissionsRaw ?? []).filter(
      (s) => s.text_content?.trim()
    );
    const pendingClientIds = new Set(
      subsWithContent
        .filter((s) => !depuredSet.has(`${s.client_id}_${s.section_id}`))
        .map((s) => s.client_id)
    );

    setStats({
      clientsWithPending: pendingClientIds.size,
      sectionsDepuredNotSent: depItems.length,
      totalEnviado: envItems.length,
    });

    setLoadingOverview(false);
  }, []);

  useEffect(() => {
    if (!authLoading && profile?.role === "admin") loadOverview();
  }, [authLoading, profile, loadOverview]);

  // ── Load client sections ─────────────────────────────────────────────────

  const loadClient = async (clientId: string) => {
    if (!clientId) return;
    setLoadingClient(true);
    setSections([]);
    setDepuredTexts({});
    setSectionErrors({});

    const cp = clients.find((c) => c.id === clientId) ?? null;
    setClientProfile(cp);

    const [{ data: cs }, { data: parts }, { data: allSections }, { data: subs }, { data: files }, { data: pipeline }] =
      await Promise.all([
        supabase.from("client_sections").select("*").eq("client_id", clientId).order("display_order"),
        supabase.from("onboarding_parts").select("*").order("part_number"),
        supabase.from("onboarding_sections").select("*"),
        supabase.from("submissions").select("*").eq("client_id", clientId),
        supabase.from("submission_files").select("*").eq("client_id", clientId),
        supabase.from("pipeline_items").select("*").eq("client_id", clientId),
      ]);

    const partMap = new Map((parts ?? []).map((p) => [p.id, p]));
    const sectionMap = new Map((allSections ?? []).map((s) => [s.id, s]));
    const subMap = new Map((subs ?? []).map((s) => [s.section_id, s]));
    const filesBySubmission = new Map<string, SubmissionFile[]>();
    for (const f of files ?? []) {
      const arr = filesBySubmission.get(f.submission_id) ?? [];
      arr.push(f);
      filesBySubmission.set(f.submission_id, arr);
    }
    const pipelineMap = new Map((pipeline ?? []).map((p) => [p.section_id, p]));

    const rows: SectionRow[] = (cs ?? [])
      .map((clientSection) => {
        const section = sectionMap.get(clientSection.section_id);
        if (!section) return null;
        const part = partMap.get(section.part_id);
        if (!part) return null;
        const sub = subMap.get(section.id) ?? null;
        const submissionWithFiles: SubmissionWithFiles | null = sub
          ? { ...sub, submission_files: filesBySubmission.get(sub.id) ?? [] }
          : null;
        const pipelineItem = (pipelineMap.get(section.id) as PipelineItem | undefined) ?? null;
        return { section, part, submission: submissionWithFiles, pipelineItem };
      })
      .filter((r): r is SectionRow => r !== null);

    // Pre-fill depured texts from existing pipeline items
    const texts: Record<number, string> = {};
    for (const row of rows) {
      if (row.pipelineItem?.depured_text) {
        texts[row.section.id] = row.pipelineItem.depured_text;
      }
    }
    setDepuredTexts(texts);
    setSections(rows);
    setLoadingClient(false);
  };

  useEffect(() => {
    if (selectedClientId) loadClient(selectedClientId);
  }, [selectedClientId]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const downloadFile = async (file: SubmissionFile) => {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(file.file_path, 60);
    if (data?.signedUrl) {
      const a = document.createElement("a");
      a.href = data.signedUrl;
      a.download = file.file_name;
      a.click();
    }
  };

  const depureWithAI = async (row: SectionRow) => {
    const rawText = row.submission?.text_content ?? "";
    if (!rawText.trim()) return;

    const sectionId = row.section.id;
    setDepuring((prev) => new Set(prev).add(sectionId));
    setSectionErrors((prev) => ({ ...prev, [sectionId]: "" }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("No autenticado");

      const res = await fetch("/api/depure", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          raw_text: rawText,
          section_title: row.section.title,
          section_description: row.section.description,
          company_name: clientProfile?.company_name ?? clientProfile?.full_name ?? "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");

      setDepuredTexts((prev) => ({ ...prev, [sectionId]: data.depured_text }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al depurar";
      setSectionErrors((prev) => ({ ...prev, [sectionId]: msg }));
    } finally {
      setDepuring((prev) => {
        const next = new Set(prev);
        next.delete(sectionId);
        return next;
      });
    }
  };

  const saveDepuration = async (row: SectionRow) => {
    const sectionId = row.section.id;
    const text = depuredTexts[sectionId] ?? "";
    setSavingIds((prev) => new Set(prev).add(sectionId));
    setSectionErrors((prev) => ({ ...prev, [sectionId]: "" }));

    const { error } = await supabase.from("pipeline_items").upsert(
      {
        client_id: selectedClientId,
        section_id: sectionId,
        depured_text: text,
        status: "depurado",
        depured_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "client_id,section_id" }
    );

    if (error) {
      setSectionErrors((prev) => ({ ...prev, [sectionId]: error.message }));
    } else {
      // Refresh pipeline item in sections state
      setSections((prev) =>
        prev.map((r) => {
          if (r.section.id !== sectionId) return r;
          return {
            ...r,
            pipelineItem: {
              ...(r.pipelineItem ?? ({} as PipelineItem)),
              client_id: selectedClientId,
              section_id: sectionId,
              depured_text: text,
              status: "depurado" as const,
              depured_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              sent_at: null,
              id: r.pipelineItem?.id ?? "",
            },
          };
        })
      );
    }

    setSavingIds((prev) => {
      const next = new Set(prev);
      next.delete(sectionId);
      return next;
    });
  };

  // ── Group sections by part ───────────────────────────────────────────────

  const sectionsByPart = sections.reduce<Record<number, { part: OnboardingPart; rows: SectionRow[] }>>(
    (acc, row) => {
      const pid = row.part.id;
      if (!acc[pid]) acc[pid] = { part: row.part, rows: [] };
      acc[pid].rows.push(row);
      return acc;
    },
    {}
  );

  if (authLoading || !user) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-zinc-50">
      {/* Page header */}
      <div className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">Pipeline de Depuración</h1>
            <p className="text-sm text-zinc-500">Limpia y estructura los datos de los clientes para exportar a Pandai</p>
          </div>
          <Link
            href="/dashboard/admin/pipeline/prompts"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
          >
            📝 Plantillas de prompts
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Overview stats ── */}
        {!loadingOverview && stats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Clientes pendientes</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">{stats.clientsWithPending}</p>
              <p className="mt-1 text-xs text-zinc-500">Con datos sin depurar</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Depurados</p>
              <p className="mt-2 text-3xl font-bold text-green-600">{stats.sectionsDepuredNotSent}</p>
              <p className="mt-1 text-xs text-zinc-500">Secciones listas para enviar</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Enviados a Pandai</p>
              <p className="mt-2 text-3xl font-bold text-purple-600">{stats.totalEnviado}</p>
              <p className="mt-1 text-xs text-zinc-500">Secciones completadas</p>
            </div>
          </div>
        )}

        {/* ── Client selector ── */}
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <label className="mb-2 block text-sm font-semibold text-zinc-700">Seleccionar cliente</label>
          <select
            value={selectedClientId}
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">— Elige un cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name
                  ? `${c.company_name}${c.full_name ? ` (${c.full_name})` : ""}`
                  : c.full_name ?? c.id}
                {c.templateName ? ` · ${c.templateName}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* ── Loading ── */}
        {loadingClient && (
          <div className="flex justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          </div>
        )}

        {/* ── No sections ── */}
        {!loadingClient && selectedClientId && sections.length === 0 && (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center">
            <p className="text-sm text-zinc-500">Este cliente no tiene secciones asignadas.</p>
          </div>
        )}

        {/* ── Sections grouped by part ── */}
        {!loadingClient &&
          Object.values(sectionsByPart).map(({ part, rows }) => (
            <div key={part.id}>
              {/* Part header */}
              <div className="mb-3 flex items-center gap-3">
                <span className="text-lg">{["🏢", "🧠", "🛠️", "💬"][part.part_number - 1] ?? "📋"}</span>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Parte {part.part_number}
                  </p>
                  <h2 className="font-semibold text-zinc-900">{part.title}</h2>
                </div>
              </div>

              <div className="space-y-4">
                {rows.map((row) => {
                  const sectionId = row.section.id;
                  const status = getPipelineStatus(row);
                  const isDepuring = depuring.has(sectionId);
                  const isSaving = savingIds.has(sectionId);
                  const sectionError = sectionErrors[sectionId];
                  const hasRawText = !!row.submission?.text_content?.trim();
                  const files = row.submission?.submission_files ?? [];

                  return (
                    <div
                      key={sectionId}
                      className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                    >
                      {/* Section header */}
                      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3">
                        <h3 className="font-medium text-zinc-900">{row.section.title}</h3>
                        <div className="flex items-center gap-3">
                          {row.pipelineItem?.depured_at && status === "depurado" && (
                            <span className="text-xs text-zinc-400">
                              Depurado {new Date(row.pipelineItem.depured_at).toLocaleDateString("es")}
                            </span>
                          )}
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[status]}`}>
                            {STATUS_LABEL[status]}
                          </span>
                        </div>
                      </div>

                      {/* Two columns */}
                      <div className="grid grid-cols-2 divide-x divide-zinc-100">
                        {/* LEFT: raw client data */}
                        <div className="p-5">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Datos del cliente
                          </p>
                          {row.submission?.text_content ? (
                            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-700">
                              {row.submission.text_content}
                            </pre>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">Sin texto enviado</p>
                          )}

                          {files.length > 0 && (
                            <div className="mt-3 space-y-1.5">
                              <p className="text-xs font-medium text-zinc-500">
                                {files.length} archivo{files.length !== 1 ? "s" : ""}
                              </p>
                              {files.map((f) => (
                                <div
                                  key={f.id}
                                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                                >
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-zinc-700">{f.file_name}</p>
                                    {f.file_size && (
                                      <p className="text-xs text-zinc-400">{formatBytes(f.file_size)}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => downloadFile(f)}
                                    className="ml-2 shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 hover:bg-zinc-50"
                                  >
                                    ⬇ Descargar
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* RIGHT: depured text */}
                        <div className="p-5">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                            Datos depurados
                          </p>
                          {isDepuring ? (
                            <div className="flex h-32 items-center justify-center rounded-lg bg-blue-50">
                              <div className="flex flex-col items-center gap-2">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                                <p className="text-xs text-blue-600">Depurando con IA...</p>
                              </div>
                            </div>
                          ) : (
                            <textarea
                              rows={8}
                              value={depuredTexts[sectionId] ?? ""}
                              onChange={(e) =>
                                setDepuredTexts((prev) => ({ ...prev, [sectionId]: e.target.value }))
                              }
                              placeholder="El texto depurado aparecerá aquí. Puedes editarlo antes de guardar."
                              className="w-full resize-y rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs leading-relaxed text-zinc-800 outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-400/20"
                            />
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 border-t border-zinc-100 px-5 py-3">
                        <button
                          onClick={() => depureWithAI(row)}
                          disabled={isDepuring || !hasRawText}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isDepuring ? "Depurando..." : "✨ Depurar con IA"}
                        </button>

                        <button
                          onClick={() => saveDepuration(row)}
                          disabled={isSaving || !depuredTexts[sectionId]?.trim()}
                          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {isSaving ? "Guardando..." : "💾 Guardar depuración"}
                        </button>

                        <div className="relative group">
                          <button
                            disabled
                            className="cursor-not-allowed rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-2 text-xs font-medium text-zinc-400 opacity-60"
                          >
                            🚀 Enviar a Pandai
                          </button>
                          <div className="pointer-events-none absolute bottom-full left-0 mb-1 hidden w-48 rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg group-hover:block">
                            Webhook no configurado
                          </div>
                        </div>

                        {sectionError && (
                          <p className="ml-auto text-xs text-red-600">{sectionError}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
