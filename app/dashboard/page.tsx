"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";

export default function DashboardPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (profile?.role === "admin") {
      router.replace("/dashboard/admin");
    } else if (profile?.project_id) {
      router.replace("/dashboard/portal");
    } else {
      router.replace("/dashboard/onboarding");
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-zinc-500">Cargando...</p>
    </div>
  );
}
