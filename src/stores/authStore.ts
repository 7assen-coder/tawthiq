import { create } from "zustand";
import type { AccessStatus, ContactInfo } from "@/services/tauriAdapter";

interface AuthState {
  isAuthenticated: boolean;
  hasExistingPin: boolean | null;
  isLoading: boolean;
  accessRevoked: boolean;
  offlineLocked: boolean;
  isAdminMachine: boolean;
  installId: string;
  contact: ContactInfo;
  revokeMessageFr: string;
  revokeMessageAr: string;
  setAuthenticated: (val: boolean) => void;
  setHasExistingPin: (val: boolean | null) => void;
  setLoading: (val: boolean) => void;
  setAccessRevoked: (revoked: boolean, fr?: string, ar?: string) => void;
  setOfflineLocked: (locked: boolean) => void;
  setAccessFromStatus: (status: AccessStatus) => void;
}

const defaultContact: ContactInfo = {
  whatsapp: "+22241824343",
  email: "MoHasseenn@gmail.com",
};

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  hasExistingPin: null,
  isLoading: true,
  accessRevoked: false,
  offlineLocked: false,
  isAdminMachine: false,
  installId: "",
  contact: defaultContact,
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
  setOfflineLocked: (locked) =>
    set({
      offlineLocked: locked,
      ...(locked ? { isAuthenticated: false } : {}),
    }),
  setAccessFromStatus: (status) =>
    set({
      installId: status.install_id,
      contact: status.contact ?? defaultContact,
      isAdminMachine: status.is_admin,
      accessRevoked: status.revoked,
      offlineLocked: status.offline_locked,
      revokeMessageFr: status.message_fr,
      revokeMessageAr: status.message_ar,
      ...(status.revoked || status.offline_locked
        ? { isAuthenticated: false }
        : {}),
    }),
}));
