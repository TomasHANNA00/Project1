"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    // Supabase detects the ?code= param from the OAuth redirect and exchanges
    // it for a session automatically (detectSessionInUrl: true).
    // We just wait for the auth state to settle then forward to dashboard.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    // Safety: if already signed in when this page loads, redirect immediately.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        router.replace("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100vh",
      gap: "12px",
      background: "#F9FAFB",
    }}>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      <p style={{ fontSize: "13px", color: "#94A3B8" }}>Iniciando sesión...</p>
    </div>
  );
}
