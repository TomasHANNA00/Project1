"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import type { OnboardingSection, SubmissionWithFiles, SubmissionFile } from "@/lib/types";
import FileUploadZone from "./FileUploadZone";

interface Props {
  section: OnboardingSection;
  clientId: string;
  currentUserId: string;
  isAdmin: boolean;
  initialSubmission?: SubmissionWithFiles;
  onUpdate: (sectionId: number, updated: SubmissionWithFiles) => void;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatus(sub?: SubmissionWithFiles): "pending" | "submitted" | "validated" {
  if (!sub) return "pending";
  if (sub.admin_validated) return "validated";
  const hasContent =
    (sub.text_content && sub.text_content.trim()) ||
    (sub.submission_files && sub.submission_files.length > 0);
  return hasContent ? "submitted" : "pending";
}

function StatusBadge({ status }: { status: "pending" | "submitted" | "validated" }) {
  if (status === "validated") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        ✅ Validado
      </span>
    );
  }
  if (status === "submitted") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
        📤 Enviado
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
      ⏳ Pendiente
    </span>
  );
}

export default function SectionCard({
  section,
  clientId,
  currentUserId,
  isAdmin,
  initialSubmission,
  onUpdate,
}: Props) {
  const [localSub, setLocalSub] = useState<SubmissionWithFiles | undefined>(
    initialSubmission
  );
  const [textDraft, setTextDraft] = useState(
    initialSubmission?.text_content ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  const status = getStatus(localSub);
  const adminFiles = localSub?.submission_files?.filter(
    (f) => f.uploaded_by_role === "admin"
  ) ?? [];
  const hasAdminFiles = !isAdmin && adminFiles.length > 0;

  // ── Save text ──────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const { data, error: err } = await supabase
        .from("submissions")
        .upsert(
          {
            client_id: clientId,
            section_id: section.id,
            text_content: textDraft.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,section_id" }
        )
        .select("*, submission_files(*)")
        .single();
      if (err) throw err;
      setLocalSub(data);
      onUpdate(section.id, data);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      setError("Error al guardar. Intenta de nuevo.");
    } finally {
      setSaving(false);
    }
  };

  // ── Upload file ────────────────────────────────────────────
  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      // Ensure submission row exists
      const { data: sub, error: subErr } = await supabase
        .from("submissions")
        .upsert(
          {
            client_id: clientId,
            section_id: section.id,
            text_content: localSub?.text_content ?? null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "client_id,section_id" }
        )
        .select("id")
        .single();
      if (subErr) throw subErr;

      // Upload to storage
      const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
      const path = `${clientId}/${section.id}/${uniqueName}`;
      const { error: uploadErr } = await supabase.storage
        .from("submissions")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (uploadErr) throw uploadErr;

      // Record in DB
      const { data: fileRecord, error: fileErr } = await supabase
        .from("submission_files")
        .insert({
          submission_id: sub.id,
          client_id: clientId,
          file_name: file.name,
          file_path: path,
          file_size: file.size,
          mime_type: file.type || "application/octet-stream",
          uploaded_by: currentUserId,
          uploaded_by_role: isAdmin ? "admin" : "client",
        })
        .select("*")
        .single();
      if (fileErr) throw fileErr;

      const existingFiles = localSub?.submission_files ?? [];
      const updatedSub: SubmissionWithFiles = {
        ...(localSub ?? {
          id: sub.id,
          client_id: clientId,
          section_id: section.id,
          text_content: null,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          admin_validated: false,
          admin_validated_at: null,
          client_approved: false,
          client_approved_at: null,
          submission_files: [],
        }),
        submission_files: [...existingFiles, fileRecord],
      };
      setLocalSub(updatedSub);
      onUpdate(section.id, updatedSub);
    } catch {
      setError("Error al subir el archivo. Intenta de nuevo.");
    } finally {
      setUploading(false);
    }
  };

  // ── Download file ──────────────────────────────────────────
  const handleDownload = async (file: SubmissionFile) => {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(file.file_path, 60);
    if (data?.signedUrl) {
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = file.file_name;
      link.click();
    }
  };

  // ── Delete file ───────────────────────────────────────────
  const handleDeleteFile = async (file: SubmissionFile) => {
    if (!confirm(`¿Eliminar "${file.file_name}"? Esta acción no se puede deshacer.`)) return;
    setDeletingFileId(file.id);
    setError(null);
    try {
      const { error: storageErr } = await supabase.storage
        .from("submissions")
        .remove([file.file_path]);
      if (storageErr) throw storageErr;

      const { error: dbErr } = await supabase
        .from("submission_files")
        .delete()
        .eq("id", file.id);
      if (dbErr) throw dbErr;

      const updatedFiles = (localSub?.submission_files ?? []).filter((f) => f.id !== file.id);
      const updatedSub: SubmissionWithFiles = { ...localSub!, submission_files: updatedFiles };
      setLocalSub(updatedSub);
      onUpdate(section.id, updatedSub);
    } catch {
      setError("Error al eliminar el archivo. Intenta de nuevo.");
    } finally {
      setDeletingFileId(null);
    }
  };

  // ── Admin: validate section ────────────────────────────────
  const handleValidate = async () => {
    if (!localSub) return;
    const newVal = !localSub.admin_validated;
    const { data, error: err } = await supabase
      .from("submissions")
      .update({
        admin_validated: newVal,
        admin_validated_at: newVal ? new Date().toISOString() : null,
      })
      .eq("id", localSub.id)
      .select("*, submission_files(*)")
      .single();
    if (!err && data) {
      setLocalSub(data);
      onUpdate(section.id, data);
    }
  };

  // ── Client: approve admin upload ───────────────────────────
  const handleClientApprove = async (approved: boolean) => {
    if (!localSub) return;
    const { data, error: err } = await supabase
      .from("submissions")
      .update({
        client_approved: approved,
        client_approved_at: approved ? new Date().toISOString() : null,
      })
      .eq("id", localSub.id)
      .select("*, submission_files(*)")
      .single();
    if (!err && data) {
      setLocalSub(data);
      onUpdate(section.id, data);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
        <div>
          <h3 className="font-semibold text-zinc-900">{section.title}</h3>
          <p className="mt-0.5 text-sm text-zinc-500">{section.description}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {/* Body */}
      <div className="space-y-4 px-5 py-4">
        {/* Admin-uploaded files notice (client view) */}
        {hasAdminFiles && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="mb-3 text-sm font-medium text-blue-800">
              📁 El equipo de Vambe subió archivos en tu nombre:
            </p>
            <ul className="space-y-2">
              {adminFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm shadow-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-800">
                      {f.file_name}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {formatFileSize(f.file_size)} · {formatDate(f.uploaded_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDownload(f)}
                    className="ml-3 shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    Descargar
                  </button>
                </li>
              ))}
            </ul>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-blue-700">
              <input
                type="checkbox"
                checked={localSub?.client_approved ?? false}
                onChange={(e) => handleClientApprove(e.target.checked)}
                className="h-4 w-4 rounded border-blue-300 text-blue-600"
              />
              <span className="font-medium">Validar información</span>
            </label>
          </div>
        )}

        {/* Text area */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Respuesta de texto
          </label>
          <textarea
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            rows={4}
            placeholder="Escribe aquí tu respuesta..."
            className="w-full resize-y rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
        </div>

        {/* File upload zone */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-zinc-700">
            Archivos adjuntos
          </label>
          <FileUploadZone onFileSelect={handleFileUpload} uploading={uploading} />
        </div>

        {/* Uploaded files list */}
        {localSub?.submission_files && localSub.submission_files.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-700">
              Archivos subidos ({localSub.submission_files.length})
            </p>
            <ul className="space-y-1.5">
              {localSub.submission_files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-zinc-800">
                        {f.file_name}
                      </span>
                      {f.uploaded_by_role === "admin" && (
                        <span className="shrink-0 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                          Subido por el administrador
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {formatFileSize(f.file_size)}{" "}
                      {f.file_size ? "·" : ""} {formatDate(f.uploaded_at)}
                    </p>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleDownload(f)}
                      className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 shadow-sm ring-1 ring-zinc-200 transition-colors hover:bg-zinc-100"
                    >
                      ⬇ Descargar
                    </button>
                    {(isAdmin || f.uploaded_by === currentUserId) && (
                      <button
                        onClick={() => handleDeleteFile(f)}
                        disabled={deletingFileId === f.id}
                        className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-red-500 shadow-sm ring-1 ring-zinc-200 transition-colors hover:bg-red-50 disabled:opacity-40"
                        title="Eliminar archivo"
                      >
                        {deletingFileId === f.id ? "..." : "🗑"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            {savedOk && (
              <span className="flex items-center text-sm text-green-600">
                ✓ Guardado
              </span>
            )}
          </div>

          {/* Admin: validate button */}
          {isAdmin && localSub && (
            <button
              onClick={handleValidate}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                localSub.admin_validated
                  ? "bg-green-100 text-green-700 hover:bg-green-200"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
              }`}
            >
              {localSub.admin_validated ? "✅ Validado" : "Marcar como validado"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
