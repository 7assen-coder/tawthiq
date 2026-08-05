import { create } from "zustand";
import type { SaisieMode, SuggestedColumnMap, TabId } from "@/types";
import { useSessionStore } from "./sessionStore";

export const UI_DRAFT_KEY = "tawthiq.uiDraft.v1";

export interface ImportDraft {
  filePaths: string[];
  fileName: string;
  activeSheet: number;
  page: number;
  search: string;
  mapOverrides: Record<string, SuggestedColumnMap>;
  imported: boolean;
}

export interface ManuelDraft {
  source: "cnam" | "olivex";
  page: number;
  search: string;
  showAddForm: boolean;
  addForm: Record<string, string> | null;
  editingRowId: number | null;
  editForm: Record<string, string> | null;
}

export interface UiDraftSnapshot {
  activeTab: TabId;
  saisieMode: SaisieMode;
  import: ImportDraft | null;
  manuel: ManuelDraft;
}

const defaultManuel: ManuelDraft = {
  source: "cnam",
  page: 0,
  search: "",
  showAddForm: false,
  addForm: null,
  editingRowId: null,
  editForm: null,
};

function readStored(): Partial<UiDraftSnapshot> {
  try {
    const raw = localStorage.getItem(UI_DRAFT_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UiDraftSnapshot;
  } catch {
    return {};
  }
}

const stored = readStored();

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function snapshotFrom(
  saisieMode: SaisieMode,
  importDraft: ImportDraft | null,
  manuelDraft: ManuelDraft
): UiDraftSnapshot {
  return {
    activeTab: useSessionStore.getState().activeTab,
    saisieMode,
    import: importDraft,
    manuel: manuelDraft,
  };
}

function sanitizeForDisk(snap: UiDraftSnapshot): UiDraftSnapshot {
  return {
    ...snap,
    import: snap.import
      ? { ...snap.import, search: "" }
      : null,
    manuel: {
      ...snap.manuel,
      search: "",
      showAddForm: false,
      addForm: null,
      editingRowId: null,
      editForm: null,
    },
  };
}

function writeSnapshot(snap: UiDraftSnapshot) {
  try {
    localStorage.setItem(UI_DRAFT_KEY, JSON.stringify(sanitizeForDisk(snap)));
  } catch {
    /* quota / private mode */
  }
}

interface UiDraftState {
  saisieMode: SaisieMode;
  importDraft: ImportDraft | null;
  manuelDraft: ManuelDraft;
  setSaisieMode: (mode: SaisieMode) => void;
  setImportDraft: (draft: ImportDraft | null) => void;
  setManuelDraft: (draft: ManuelDraft) => void;
  persistNow: () => void;
}

function schedulePersist(get: () => UiDraftState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = get();
    writeSnapshot(snapshotFrom(s.saisieMode, s.importDraft, s.manuelDraft));
  }, 300);
}

export const useUiDraftStore = create<UiDraftState>((set, get) => ({
  saisieMode: stored.saisieMode === "manuel" ? "manuel" : "import",
  importDraft: stored.import?.filePaths?.length ? stored.import : null,
  manuelDraft: {
    ...defaultManuel,
    ...(stored.manuel ?? {}),
  },
  setSaisieMode: (mode) => {
    set({ saisieMode: mode });
    schedulePersist(get);
  },
  setImportDraft: (draft) => {
    set({ importDraft: draft });
    schedulePersist(get);
  },
  setManuelDraft: (draft) => {
    set({ manuelDraft: draft });
    schedulePersist(get);
  },
  persistNow: () => {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    const s = get();
    writeSnapshot(snapshotFrom(s.saisieMode, s.importDraft, s.manuelDraft));
  },
}));
