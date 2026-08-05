import { create } from "zustand";
import type { Session, TabId } from "@/types";

interface SessionState {
  currentSession: Session | null;
  activeTab: TabId;
  language: "fr" | "ar";
  theme: "light" | "dark";
  backupIntervalHours: number;
  setCurrentSession: (session: Session) => void;
  setActiveTab: (tab: TabId) => void;
  setLanguage: (lang: "fr" | "ar") => void;
  setTheme: (theme: "light" | "dark") => void;
  setBackupIntervalHours: (hours: number) => void;
}

function loadPersisted<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

const TABS: TabId[] = ["saisie", "rapport", "historique", "reglages"];

const initialTheme = loadPersisted<"light" | "dark">("tawthiq_theme", "light");
const initialLang = loadPersisted<"fr" | "ar">("tawthiq_lang", "fr");
const initialBackup = loadPersisted<number>("tawthiq_backup_interval", 0);
const storedTab = loadPersisted<TabId>("tawthiq_active_tab", "saisie");
const initialTab = TABS.includes(storedTab) ? storedTab : "saisie";

if (initialTheme === "dark") {
  document.documentElement.classList.add("dark");
}
if (initialLang === "ar") {
  document.documentElement.dir = "rtl";
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  activeTab: initialTab,
  language: initialLang,
  theme: initialTheme,
  backupIntervalHours: initialBackup,
  setCurrentSession: (session) => set({ currentSession: session }),
  setActiveTab: (tab) => {
    localStorage.setItem("tawthiq_active_tab", JSON.stringify(tab));
    set({ activeTab: tab });
  },
  setLanguage: (lang) => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    localStorage.setItem("tawthiq_lang", JSON.stringify(lang));
    set({ language: lang });
  },
  setTheme: (theme) => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("tawthiq_theme", JSON.stringify(theme));
    set({ theme });
  },
  setBackupIntervalHours: (hours) => {
    localStorage.setItem("tawthiq_backup_interval", JSON.stringify(hours));
    set({ backupIntervalHours: hours });
  },
}));
