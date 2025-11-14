import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabaseClient';

type AuthState = {
  user: any;
  session: any;
  loading: boolean;
  setUser: (user: any) => void;
  setSession: (session: any) => void;
  signInWithOtp: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      session: null,
      loading: false,
      setUser: (user) => set({ user }),
      setSession: (session) => set({ session }),
      signInWithOtp: async (email: string) => {
        set({ loading: true });
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        set({ loading: false });
      },
      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null });
      },
      initialize: async () => {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        set({ session, user: session?.user ?? null });
        supabase.auth.onAuthStateChange((_event, newSession) => {
          set({ session: newSession, user: newSession?.user ?? null });
        });
      }
    }),
    {
      name: 'auth-store'
    }
  )
);
