"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleSession = async (session: { user: { id: string; email?: string } }) => {
      const res = await fetch("/api/auth/verify-oauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: session.user.id,
          email: session.user.email,
        }),
      });
      const { allowed } = await res.json();

      if (!allowed) {
        await supabase.auth.signOut();
        router.replace("/login?error=no_account");
        return;
      }

      router.replace("/dashboard");
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        subscription.unsubscribe();
        handleSession(session);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        subscription.unsubscribe();
        handleSession(session);
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
