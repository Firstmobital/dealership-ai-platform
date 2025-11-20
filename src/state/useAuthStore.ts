import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabaseClient";
import type { Session, User } from "@supabase/supabase-js";

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;

  // actions
  initialize: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<void>;
  sendResetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      loading: false,
      initialized: false,
      error: null,

      // --------------------------------------------------
      // Initialize from existing Supabase session
      // --------------------------------------------------
      initialize: async () => {
        const { initialized } = get();
        if (initialized) return;

        set({ loading: true, error: null });

        try {
          const {
            data: { session },
          } = await supabase.auth.getSession();

          set({
            session,
            user: session?.user ?? null,
            loading: false,
            initialized: true,
          });

          // Subscribe to auth state changes
          supabase.auth.onAuthStateChange((_event, newSession) => {
            set({
              session: newSession,
              user: newSession?.user ?? null,
            });
          });
        } catch (error: any) {
          console.error("[useAuthStore] initialize error:", error);
          set({
            loading: false,
            initialized: true,
            error: error?.message ?? "Failed to initialize auth",
          });
        }
      },

      // --------------------------------------------------
      // Email + password login
      // --------------------------------------------------
      signInWithPassword: async (email: string, password: string) => {
        set({ loading: true, error: null });
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          console.error("[useAuthStore] signIn error:", error);
          set({
            loading: false,
            error: error.message,
          });
          throw error;
        }

        set({
          loading: false,
          session: data.session,
          user: data.user ?? null,
          error: null,
        });
      },

      // --------------------------------------------------
      // Email + password signup
      // --------------------------------------------------
      signUpWithPassword: async (email: string, password: string) => {
        set({ loading: true, error: null });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/update-password`,
          },
        });

        if (error) {
          console.error("[useAuthStore] signUp error:", error);
          set({
            loading: false,
            error: error.message,
          });
          throw error;
        }

        // Depending on email-confirmation settings, session may be null here.
        set({
          loading: false,
          session: data.session ?? null,
          user: data.user ?? null,
          error: null,
        });
      },

      // --------------------------------------------------
      // Send reset password email
      // --------------------------------------------------
      sendResetPassword: async (email: string) => {
        set({ loading: true, error: null });

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/update-password`,
        });

        if (error) {
          console.error("[useAuthStore] resetPassword error:", error);
          set({
            loading: false,
            error: error.message,
          });
          throw error;
        }

        set({ loading: false, error: null });
      },

      // --------------------------------------------------
      // Update password (called from /auth/update-password)
      // --------------------------------------------------
      updatePassword: async (newPassword: string) => {
        set({ loading: true, error: null });

        const { data, error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          console.error("[useAuthStore] updatePassword error:", error);
          set({
            loading: false,
            error: error.message,
          });
          throw error;
        }

        set({
          loading: false,
          user: data.user ?? null,
          error: null,
        });
      },

      // --------------------------------------------------
      // Sign out
      // --------------------------------------------------
      signOut: async () => {
        set({ loading: true, error: null });
        const { error } = await supabase.auth.signOut();

        if (error) {
          console.error("[useAuthStore] signOut error:", error);
          set({
            loading: false,
            error: error.message,
          });
          throw error;
        }

        set({
          loading: false,
          session: null,
          user: null,
          error: null,
        });
      },
    }),
    {
      name: "auth-store",
    }
  )
);
