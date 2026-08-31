"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

export function useAuth() {
  const localMode = process.env.NEXT_PUBLIC_NESTED_LOCAL_MODE === "1";
  const localUser = useMemo(() => ({ id: "local", email: "Local workspace" }) as User, []);
  const [user, setUser] = useState<User | null>(localMode ? localUser : null);
  const [isLoading, setIsLoading] = useState(!localMode);
  const supabase = useMemo(() => localMode ? null : createClient(), [localMode]);

  useEffect(() => {
    if (!supabase) return;
    // Get initial session
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setIsLoading(false);
    };

    getUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setIsLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    window.location.href = "/login";
  }, [supabase]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    signOut,
  };
}
