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
  // Tracks whether getSession() has already resolved so onAuthStateChange
  // doesn't redundantly re-fetch the profile on the INITIAL_SESSION event.
  const initialised = useRef(false);

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
    initialised.current = false;

    // Safety timeout — if Supabase never responds (bad env vars, network),
    // release the loading gate so the app doesn't hang forever.
    const timeout = setTimeout(() => {
      if (mounted.current) setLoading(false);
    }, 8000);

    // 1. getSession() explicitly reads the stored token and registers it on
    //    the Supabase client, ensuring that every subsequent query (profile
    //    fetch, sections fetch, etc.) goes out with a valid Authorization
    //    header. This is the reliable init path in production.
    const init = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!mounted.current) return;
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await fetchProfile(session.user.id);
        }
      } catch {
        // Supabase client misconfigured or network unavailable — still
        // release loading so the app can redirect to /login.
      } finally {
        initialised.current = true;
        if (mounted.current) {
          clearTimeout(timeout);
          setLoading(false);
        }
      }
    };

    init();

    // 2. onAuthStateChange handles sign-in / sign-out / token-refresh events
    //    that happen AFTER the initial load (e.g. user logs in on /login).
    //    We skip the INITIAL_SESSION echo because init() above already
    //    handled it.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted.current) return;
      // Skip the first INITIAL_SESSION event — init() already handled it.
      if (!initialised.current) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        await fetchProfile(session.user.id);
      } else {
        if (mounted.current) setProfile(null);
      }

      if (mounted.current) setLoading(false);
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
