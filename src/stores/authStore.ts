import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthActions {
  initialize: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (username: string, password: string) => Promise<{ error: Error | null }>;
  signInAsGuest: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  convertGuestToAccount: (username: string, password: string) => Promise<{ error: Error | null }>;
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  session: null,
  profile: null,
  loading: true,
  initialized: false,

  initialize: async () => {
    try {
      // Get initial session
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        set({ user: session.user, session });
        await get().fetchProfile();
      }

      // Listen for auth changes
      supabase.auth.onAuthStateChange(async (event, session) => {
        set({ user: session?.user ?? null, session });

        if (session?.user) {
          await get().fetchProfile();
        } else {
          set({ profile: null });
        }
      });
    } finally {
      set({ loading: false, initialized: true });
    }
  },

  signIn: async (username: string, password: string) => {
    set({ loading: true });
    try {
      // Generate email from username for Supabase auth
      const email = `${username.toLowerCase()}@phase10.local`;
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        // Make error message user-friendly
        if (error.message.includes('Invalid login credentials')) {
          return { error: new Error('Invalid username or password') };
        }
        return { error: new Error(error.message) };
      }
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (username: string, password: string) => {
    set({ loading: true });
    try {
      // Generate email from username for Supabase auth
      const email = `${username.toLowerCase()}@phase10.local`;
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            is_guest: false,
          },
        },
      });
      if (error) {
        // Make error message user-friendly
        if (error.message.includes('already registered')) {
          return { error: new Error('Username already taken') };
        }
        return { error: new Error(error.message) };
      }
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },

  signInAsGuest: async () => {
    set({ loading: true });
    try {
      // Use Supabase anonymous sign-in
      const { error } = await supabase.auth.signInAnonymously({
        options: {
          data: {
            username: `Guest_${Math.random().toString(36).substring(2, 8)}`,
            is_guest: true,
          },
        },
      });
      return { error: error ? new Error(error.message) : null };
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    set({ loading: true });
    try {
      await supabase.auth.signOut();
      set({ user: null, session: null, profile: null });
    } finally {
      set({ loading: false });
    }
  },

  fetchProfile: async () => {
    const { user } = get();
    if (!user) return;

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!error && data) {
      set({ profile: data as Profile });
    }
  },

  updateProfile: async (updates: Partial<Profile>) => {
    const { user } = get();
    if (!user) return { error: new Error('Not authenticated') };

    set({ loading: true });
    try {
      const { error } = await supabase
        .from('profiles')
        .update(updates as never)
        .eq('id', user.id);

      if (!error) {
        await get().fetchProfile();
      }
      return { error: error ? new Error(error.message) : null };
    } finally {
      set({ loading: false });
    }
  },

  convertGuestToAccount: async (username: string, password: string) => {
    const { user, profile } = get();
    if (!user || !profile?.is_guest) {
      return { error: new Error('Not a guest account') };
    }

    set({ loading: true });
    try {
      // Generate email from username for Supabase auth
      const email = `${username.toLowerCase()}@phase10.local`;

      // Update email and password
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        password,
      });

      if (updateError) {
        if (updateError.message.includes('already registered')) {
          return { error: new Error('Username already taken') };
        }
        return { error: new Error(updateError.message) };
      }

      // Update profile
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ username, is_guest: false } as never)
        .eq('id', user.id);

      if (profileError) {
        return { error: new Error(profileError.message) };
      }

      await get().fetchProfile();
      return { error: null };
    } finally {
      set({ loading: false });
    }
  },
}));
