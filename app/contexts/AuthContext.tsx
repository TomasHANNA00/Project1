"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();
      if (mounted.current) setProfile(data ?? null);
    } catch {
      if (mounted.current) setProfile(null);
    }
  };

  useEffect(() => {
    mounted.current = true;

    // Safety timeout: if Supabase never responds (bad env vars in production,
    // network issue, etc.), release the loading gate after 5 s.
    const timeout = setTimeout(() => {
      if (mounted.current) setLoading(false);
    }, 5000);

    // onAuthStateChange is the single source of truth.
    // It fires immediately with INITIAL_SESSION on subscribe (Supabase v2),
    // so we don't also need getSession().
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted.current) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        if (mounted.current) setProfile(null);
      }

      if (mounted.current) {
        clearTimeout(timeout);
        setLoading(false);
      }
    });

    return () => {
      mounted.current = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
