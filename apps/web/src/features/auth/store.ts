import { create } from "zustand";
import { api } from "../../shared/lib/api";

type UserProfile = {
  name?: string | null;
  age?: number | null;
  city?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
};

type User = {
  id: string;
  email: string;
  profile?: UserProfile | null;
  spotifyConnected?: boolean;
};

type AuthState = {
  user: User | null;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  initialized: false,
  error: null,

  init: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get("/auth/me");
      set({
        user: data.user,
        initialized: true,
        isLoading: false,
      });
    } catch {
      set({
        user: null,
        initialized: true,
        isLoading: false,
      });
    }
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/login", { email, password });
      set({
        user: data.user,
        isLoading: false,
      });
      return true;
    } catch (error: any) {
      set({
        error: error?.response?.data?.message ?? "Login failed",
        isLoading: false,
      });
      return false;
    }
  },

  signup: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.post("/auth/signup", { email, password });
      set({
        user: data.user,
        isLoading: false,
      });
      return true;
    } catch (error: any) {
      set({
        error: error?.response?.data?.message ?? "Signup failed",
        isLoading: false,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      set({ user: null });
    }
  },
}));
