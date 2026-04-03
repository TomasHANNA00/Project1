"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/contexts/AuthContext";
import OnboardingView from "@/app/components/OnboardingView";

export default function OnboardingPage() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && profile?.role === "admin") router.replace("/dashboard/admin");
  }, [user, profile, loading, router]);

  if (loading || !user) return null;

  return <OnboardingView clientId={user.id} isAdmin={false} />;
}
