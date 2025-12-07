// src/state/useAuthStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  initialize: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      loading: false,
      initialized: false,
      error: null,

      initialize: async () => {
        if (get().initialized) return;
        set({ loading: true, error: null });

        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) {
            console.error("[Auth] getSession error:", error);
            set({
              loading: false,
              initialized: true,
              error: error.message,
              session: null,
              user: null,
            });
            return;
          }

          const session = data.session;
          set({
            session,
            user: session?.user ?? null,
            loading: false,
            initialized: true,
            error: null,
          });

          // Subscribe to auth changes (login/logout/reset flows)
          supabase.auth.onAuthStateChange((_event, session) => {
            set({
              session: session ?? null,
              user: session?.user ?? null,
            });
          });
        } catch (err: any) {
          console.error("[Auth] initialize error:", err);
          set({
            loading: false,
            initialized: true,
            error: err?.message ?? "Failed to initialize auth",
            session: null,
            user: null,
          });
        }
      },

      signInWithPassword: async (email, password) => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("[Auth] signIn error:", error);
          set({ loading: false, error: error.message });
          throw error;
        }

        set({
          loading: false,
          error: null,
          session: data.session,
          user: data.session?.user ?? null,
          initialized: true,
        });
      },

      signUpWithPassword: async (email, password) => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/update-password`,
          },
        });

        if (error) {
          console.error("[Auth] signUp error:", error);
          set({ loading: false, error: error.message });
          throw error;
        }

        set({
          loading: false,
          error: null,
          session: data.session ?? null,
          user: data.session?.user ?? null,
          initialized: true,
        });
      },

      signOut: async () => {
        set({ loading: true, error: null });
        const { error } = await supabase.auth.signOut();
        if (error) {
          console.error("[Auth] signOut error:", error);
          set({ loading: false, error: error.message });
          throw error;
        }

        set({
          loading: false,
          error: null,
          session: null,
          user: null,
        });
      },

      sendResetPassword: async (email: string) => {
        set({ loading: true, error: null });
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });

        if (error) {
          console.error("[Auth] resetPassword error:", error);
          set({ loading: false, error: error.message });
          throw error;
        }

        set({ loading: false, error: null });
      },

      updatePassword: async (password: string) => {
        set({ loading: true, error: null });
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
          console.error("[Auth] updatePassword error:", error);
          set({ loading: false, error: error.message });
          throw error;
        }

        set({ loading: false, error: null });
      },
    }),
    {
      name: "auth-store",
    }
  )
);

