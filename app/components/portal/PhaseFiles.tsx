"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { PhaseFile } from "@/lib/types";

interface PhaseFilesProps {
  phaseId: string;
  clientId: string;
  initialFiles: PhaseFile[];
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function PhaseFiles({ phaseId, clientId, initialFiles }: PhaseFilesProps) {
  const [open, setOpen] = useState(initialFiles.length > 0);
  const [files, setFiles] = useState<PhaseFile[]>(initialFiles);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = "";

    setUploading(true);
    const filePath = `${clientId}/phases/${phaseId}/${Date.now()}_${file.name}`;

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(filePath, file);

    if (uploadError) {
      console.error("Upload error:", uploadError);
      setUploading(false);
      return;
    }

    const { data: inserted } = await supabase
      .from("phase_files")
      .insert({
        phase_id: phaseId,
        client_id: clientId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
        mime_type: file.type || null,
      })
      .select()
      .single();

    if (inserted) {
      setFiles((prev) => [...prev, inserted as PhaseFile]);
      setOpen(true);
    }
    setUploading(false);
  };

  const handleDownload = async (f: PhaseFile) => {
    const { data } = await supabase.storage
      .from("submissions")
      .createSignedUrl(f.file_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };

  const handleDeleteConfirm = async (f: PhaseFile) => {
    setDeletingId(f.id);
    await supabase.storage.from("submissions").remove([f.file_path]);
    await supabase.from("phase_files").delete().eq("id", f.id);
    setFiles((prev) => prev.filter((x) => x.id !== f.id));
    setConfirmId(null);
    setDeletingId(null);
  };

  return (
    <div
      style={{
        margin: "0 0 0 0",
        borderBottom: "1px solid #F1F5F9",
      }}
    >
      {/* Section header */}
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 20px",
          cursor: "pointer",
          background: "#F8FAFC",
          userSelect: "none",
        }}
      >
        {/* Paperclip icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          style={{ flexShrink: 0, color: "#64748B" }}
        >
          <path
            d="M12.5 6.5L6.5 12.5C5.1 13.9 2.9 13.9 1.5 12.5C0.1 11.1 0.1 8.9 1.5 7.5L7.5 1.5C8.4 0.6 9.8 0.6 10.7 1.5C11.6 2.4 11.6 3.8 10.7 4.7L5.2 10.2C4.8 10.6 4.1 10.6 3.7 10.2C3.3 9.8 3.3 9.1 3.7 8.7L9 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748B", flex: 1 }}>
          Documentos generales de esta fase
          {files.length > 0 && (
            <span
              style={{
                marginLeft: "8px",
                background: "#E2E8F0",
                color: "#64748B",
                borderRadius: "100px",
                padding: "1px 7px",
                fontSize: "11px",
                fontWeight: 600,
              }}
            >
              {files.length}
            </span>
          )}
        </span>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
            color: "#94A3B8",
          }}
        >
          <path
            d="M4.5 3L7.5 6L4.5 9"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Content */}
      {open && (
        <div style={{ padding: "8px 20px 12px", background: "#F8FAFC" }}>
          {/* File list */}
          {files.length > 0 && (
            <div style={{ marginBottom: "8px" }}>
              {files.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 0",
                    borderBottom: "1px solid #EFF2F5",
                  }}
                >
                  {/* File icon */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={{ flexShrink: 0, color: "#94A3B8" }}
                  >
                    <rect x="2" y="1" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M4.5 4.5h5M4.5 7h5M4.5 9.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>

                  {/* Name — clickable to download */}
                  <button
                    onClick={() => handleDownload(f)}
                    title="Descargar"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "12px",
                      color: "#3B82F6",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {f.file_name}
                  </button>

                  {/* Size */}
                  {f.file_size != null && (
                    <span style={{ fontSize: "11px", color: "#94A3B8", flexShrink: 0 }}>
                      {formatBytes(f.file_size)}
                    </span>
                  )}

                  {/* Green checkmark */}
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    style={{ flexShrink: 0 }}
                  >
                    <circle cx="7" cy="7" r="6" fill="#D1FAE5" />
                    <path
                      d="M4.5 7L6.2 8.7L9.5 5.3"
                      stroke="#059669"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Delete / confirm */}
                  {confirmId === f.id ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <button
                        onClick={() => handleDeleteConfirm(f)}
                        disabled={deletingId === f.id}
                        style={{
                          fontSize: "11px",
                          color: "white",
                          background: "#EF4444",
                          border: "none",
                          borderRadius: "4px",
                          padding: "2px 7px",
                          cursor: "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {deletingId === f.id ? "..." : "Eliminar"}
                      </button>
                      <button
                        onClick={() => setConfirmId(null)}
                        style={{
                          fontSize: "11px",
                          color: "#64748B",
                          background: "#E2E8F0",
                          border: "none",
                          borderRadius: "4px",
                          padding: "2px 7px",
                          cursor: "pointer",
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmId(f.id)}
                      title="Eliminar"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "2px",
                        color: "#CBD5E1",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "4px",
                        transition: "color 0.15s",
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#EF4444"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "#CBD5E1"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2 2l8 8M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "5px",
              background: "none",
              border: "none",
              padding: "2px 0",
              cursor: uploading ? "default" : "pointer",
              fontSize: "12px",
              color: uploading ? "#94A3B8" : "#3B82F6",
              fontWeight: 500,
            }}
          >
            {uploading ? (
              <>
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    border: "1.5px solid #94A3B8",
                    borderTopColor: "transparent",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Subiendo...
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                Adjuntar documento general
              </>
            )}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            style={{ display: "none" }}
            onChange={handleUpload}
          />
        </div>
      )}
    </div>
  );
}
