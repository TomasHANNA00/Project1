"use client";

import { useRef, useState } from "react";

interface Props {
  onFileSelect: (file: File) => void;
  uploading: boolean;
}

export default function FileUploadZone({ onFileSelect, uploading }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFileSelect(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = "";
    }
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
        isDragging
          ? "border-blue-400 bg-blue-50"
          : "border-zinc-200 bg-zinc-50 hover:border-blue-300 hover:bg-blue-50/50"
      } ${uploading ? "cursor-not-allowed opacity-60" : ""}`}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />
      {uploading ? (
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-zinc-500">Subiendo archivo...</span>
        </div>
      ) : (
        <>
          <span className="text-2xl">📎</span>
          <p className="mt-2 text-sm font-medium text-zinc-600">
            Arrastra un archivo aquí
          </p>
          <p className="text-xs text-zinc-400">o haz clic para seleccionar</p>
          <p className="mt-1 text-xs text-zinc-400">
            PDF, imágenes, documentos, cualquier tipo
          </p>
        </>
      )}
    </div>
  );
}
