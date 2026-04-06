"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/app/contexts/AuthContext";
import OnboardingView from "@/app/components/OnboardingView";
import ClientSectionManager from "@/app/components/ClientSectionManager";

export default function AdminClientDetailPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;

  const [clientName, setClientName] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
    if (!authLoading && profile?.role !== "admin") router.replace("/dashboard/onboarding");
  }, [user, profile, authLoading, router]);

  useEffect(() => {
    const fetchClient = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", clientId)
        .single();
      if (data) setClientName(data.full_name);
    };
    if (clientId && profile?.role === "admin") fetchClient();
  }, [clientId, profile]);

  if (authLoading || !user) return null;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-6 py-3 text-sm">
        <Link href="/dashboard/admin" className="text-zinc-500 hover:text-zinc-700">
          ← Clientes
        </Link>
        <span className="text-zinc-300">/</span>
        <span className="font-medium text-zinc-900">{clientName ?? clientId}</span>
      </div>

      {/* Section assignment manager */}
      <ClientSectionManager
        clientId={clientId}
        onUpdate={() => setRefreshKey((k) => k + 1)}
      />

      <OnboardingView
        clientId={clientId}
        isAdmin={true}
        clientName={clientName ?? undefined}
        refreshKey={refreshKey}
      />
    </div>
  );
}
