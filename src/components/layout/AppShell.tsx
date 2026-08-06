import { useEffect, useRef } from "react";
import { TopBar } from "./TopBar";
import { BottomTabs } from "./BottomTabs";
import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
import { useUiDraftStore } from "@/stores/uiDraftStore";
import { SaisieScreen } from "@/screens/SaisieScreen";
import { RapportScreen } from "@/screens/RapportScreen";
import { HistoriqueScreen } from "@/screens/HistoriqueScreen";
import { ReglagesScreen } from "@/screens/ReglagesScreen";
import { AdminScreen } from "@/screens/AdminScreen";
import * as api from "@/services/tauriAdapter";
import type { TabId } from "@/types";

const screens: { id: TabId; Component: React.FC }[] = [
  { id: "saisie", Component: SaisieScreen },
  { id: "rapport", Component: RapportScreen },
  { id: "historique", Component: HistoriqueScreen },
  { id: "reglages", Component: ReglagesScreen },
  { id: "admin", Component: AdminScreen },
];

const IDLE_LOCK_MS = 10 * 60 * 1000;

export function AppShell() {
  const { activeTab, setCurrentSession, backupIntervalHours, setActiveTab } = useSessionStore();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const isAdminMachine = useAuthStore((s) => s.isAdminMachine);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isAdminMachine && activeTab === "admin") {
      setActiveTab("saisie");
    }
  }, [isAdminMachine, activeTab, setActiveTab]);

  useEffect(() => {
    (async () => {
      await api.checkAndArchivePrevious();
      const session = await api.getCurrentSession();
      setCurrentSession(session);
    })();
  }, [setCurrentSession]);

  useEffect(() => {
    if (!backupIntervalHours || backupIntervalHours <= 0) return;

    const intervalMs = backupIntervalHours * 60 * 60 * 1000;
    const lastKey = "tawthiq_last_auto_backup";
    const lastBackup = Number(localStorage.getItem(lastKey) || "0");
    const elapsed = Date.now() - lastBackup;

    const doBackup = () => {
      api.autoBackup().then(() => {
        localStorage.setItem(lastKey, String(Date.now()));
      }).catch(() => {});
    };

    if (elapsed >= intervalMs) {
      doBackup();
    }

    const id = setInterval(doBackup, intervalMs);
    return () => clearInterval(id);
  }, [backupIntervalHours]);

  useEffect(() => {
    const bump = () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(async () => {
        await api.adminSessionLock();
        await api.lockSession();
        setAuthenticated(false);
      }, IDLE_LOCK_MS);
    };
    bump();
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [setAuthenticated]);

  useEffect(() => {
    const flush = () => useUiDraftStore.getState().persistNow();
    window.addEventListener("beforeunload", flush);
    const unsubTab = useSessionStore.subscribe((s, prev) => {
      if (s.activeTab !== prev.activeTab) flush();
    });
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested(async () => {
          flush();
        });
      } catch {
        /* browser / tests */
      }
    })();
    return () => {
      flush();
      unsubTab();
      window.removeEventListener("beforeunload", flush);
      unlisten?.();
    };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <TopBar />
      <div className="flex-1 overflow-hidden relative">
        {screens.map(({ id, Component }) => (
          <div
            key={id}
            className={`absolute inset-0 overflow-y-auto px-5 py-4 ${
              activeTab === id ? "z-10 visible" : "z-0 invisible"
            }`}
          >
            <Component />
          </div>
        ))}
      </div>
      <BottomTabs />
    </div>
  );
}
