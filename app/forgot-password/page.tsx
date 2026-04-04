"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/reset-password`;

    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    setLoading(false);
    if (err) {
      setError("No se pudo enviar el correo. Intenta de nuevo.");
    } else {
      setSent(true);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold text-zinc-900">Vambe</span>
          <p className="mt-1 text-sm text-zinc-500">Portal de Onboarding</p>
        </div>

        {sent ? (
          <div className="text-center">
            <p className="text-4xl">📧</p>
            <h1 className="mt-4 text-xl font-semibold text-zinc-900">
              Revisa tu correo
            </h1>
            <p className="mt-2 text-sm text-zinc-500">
              Te enviamos un enlace para restablecer tu contraseña a{" "}
              <strong>{email}</strong>. Puede tardar unos minutos.
            </p>
            <Link
              href="/login"
              className="mt-6 block text-sm font-medium text-blue-600 hover:underline"
            >
              Volver al inicio de sesión
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mb-2 text-xl font-semibold text-zinc-900">
              Recuperar contraseña
            </h1>
            <p className="mb-6 text-sm text-zinc-500">
              Ingresa tu correo y te enviaremos un enlace para restablecer tu
              contraseña.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1 block text-sm font-medium text-zinc-700"
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tu@correo.com"
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {error}
                </p>
              )}
              <button
                type="submit"
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? "Enviando..." : "Enviar enlace"}
              </button>
            </form>
            <p className="mt-4 text-center text-sm text-zinc-500">
              <Link href="/login" className="font-medium text-blue-600 hover:underline">
                Volver al inicio de sesión
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
