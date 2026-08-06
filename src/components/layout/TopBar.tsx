import { useSessionStore } from "@/stores/sessionStore";
import { useAuthStore } from "@/stores/authStore";
import { formatMonth } from "@/lib/utils";
import { SunIcon, MoonIcon } from "@/components/icons";
import { softControlBase, softToggleIdle } from "@/components/SoftActionButton";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useT } from "@/i18n/useT";
import * as api from "@/services/tauriAdapter";

export function TopBar() {
  const { currentSession, language, theme, setTheme } = useSessionStore();
  const setAuthenticated = useAuthStore((s) => s.setAuthenticated);
  const t = useT();
  const monthLabel = currentSession ? formatMonth(currentSession.month, language) : "";
  const isActive = currentSession?.status === "active";

  return (
    <div className="flex items-center justify-between gap-6 px-6 py-4 bg-[var(--bg-card)] border-b border-[var(--border)]">
      <div className="flex items-center gap-4 min-w-0">
        <span className="font-bold text-[20px] text-[var(--text-primary)] tracking-tight truncate">
          {monthLabel}
        </span>
        {isActive ? (
          <span className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[var(--green-bg)] text-[var(--green)] text-[14px] font-bold shrink-0">
            <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            {t("topbar.enCours")}
          </span>
        ) : (
          <span className="px-3.5 py-1.5 rounded-full bg-[var(--bg-app)] text-[var(--text-faint)] text-[14px] font-semibold shrink-0">
            {t("topbar.archive")}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <LanguageToggle />

        <button
          onClick={async () => {
            await api.lockSession();
            setAuthenticated(false);
          }}
          className={`${softControlBase} ${softToggleIdle}`}
        >
          {t("topbar.lock")}
        </button>

        <button
          onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          className={`${softControlBase} ${softToggleIdle}`}
        >
          {theme === "light" ? <SunIcon size={17} color="currentColor" /> : <MoonIcon size={17} color="currentColor" />}
          <span>{theme === "light" ? t("topbar.clair") : t("topbar.sombre")}</span>
        </button>
      </div>
    </div>
  );
}
