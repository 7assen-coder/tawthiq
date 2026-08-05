import { create } from "zustand";

interface AuthState {
  isAuthenticated: boolean;
  hasExistingPin: boolean | null; // null = unknown / DB error
  isLoading: boolean;
  accessRevoked: boolean;
  revokeMessageFr: string;
  revokeMessageAr: string;
  setAuthenticated: (val: boolean) => void;
  setHasExistingPin: (val: boolean | null) => void;
  setLoading: (val: boolean) => void;
  setAccessRevoked: (revoked: boolean, fr?: string, ar?: string) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  hasExistingPin: null,
  isLoading: true,
  accessRevoked: false,
  revokeMessageFr: "",
  revokeMessageAr: "",
  setAuthenticated: (val) => set({ isAuthenticated: val }),
  setHasExistingPin: (val) => set({ hasExistingPin: val }),
  setLoading: (val) => set({ isLoading: val }),
  setAccessRevoked: (revoked, fr, ar) =>
    set((state) => ({
      accessRevoked: revoked,
      revokeMessageFr: fr ?? state.revokeMessageFr,
      revokeMessageAr: ar ?? state.revokeMessageAr,
      ...(revoked ? { isAuthenticated: false } : {}),
    })),
}));
