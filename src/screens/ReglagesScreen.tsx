import { useEffect, useState } from "react";
import { LogoMark } from "@/components/Logo";
import { useSessionStore } from "@/stores/sessionStore";
import * as api from "@/services/tauriAdapter";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { ReglagesCategory } from "@/types";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/translations";
import { SoftActionButton, softControlBase, softToggleActive, softToggleIdle } from "@/components/SoftActionButton";
import { SunIcon, MoonIcon, DatabaseIcon, InfoIcon, GearIcon } from "@/components/icons";

const categories: {
  id: ReglagesCategory;
  labelKey: TKey;
  Icon: typeof SunIcon;
}[] = [
  { id: "apparence", labelKey: "settings.apparence", Icon: SunIcon },
  { id: "donnees", labelKey: "settings.donnees", Icon: DatabaseIcon },
  { id: "apropos", labelKey: "settings.apropos", Icon: InfoIcon },
];

export function ReglagesScreen() {
  const [activeCategory, setActiveCategory] = useState<ReglagesCategory>("apparence");
  const t = useT();

  return (
    <div className="h-full flex gap-5">
      <div className="w-[220px] flex flex-col gap-2">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          const Icon = cat.Icon;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-start transition-all border ${
                isActive
                  ? "bg-[var(--teal-light)] text-[var(--teal)] border-[var(--teal)]/25"
                  : "text-[var(--text-secondary)] border-transparent hover:bg-[var(--bg-app)]"
              }`}
            >
              <Icon size={18} color="currentColor" />
              <span className={`text-[15px] ${isActive ? "font-bold" : "font-medium"}`}>
                {t(cat.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] p-7 overflow-y-auto shadow-sm">
        {activeCategory === "apparence" && <ApparencePanel />}
        {activeCategory === "donnees" && <DonneesPanel />}
        {activeCategory === "apropos" && <AProposPanel />}
      </div>
    </div>
  );
}

function ApparencePanel() {
  const { language, setLanguage, theme, setTheme } = useSessionStore();
  const t = useT();
  const isDark = theme === "dark";

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-[18px] font-bold text-[var(--text-primary)]">{t("settings.apparence")}</h3>

      <div className="flex items-center justify-between gap-4 py-5 border-b border-[var(--border)]">
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.theme")}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            {isDark ? t("settings.themeDarkActive") : t("settings.themeLightActive")}
          </p>
        </div>
        <button
          onClick={() => setTheme(isDark ? "light" : "dark")}
          className={`${softControlBase} ${softToggleIdle}`}
        >
          {isDark ? <MoonIcon size={17} color="currentColor" /> : <SunIcon size={17} color="currentColor" />}
          <span>{isDark ? t("topbar.sombre") : t("topbar.clair")}</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 py-5 border-b border-[var(--border)]">
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.langue")}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("settings.langueSub")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLanguage("fr")}
            className={`${softControlBase} ${language === "fr" ? softToggleActive : softToggleIdle}`}
          >
            Français
          </button>
          <button
            onClick={() => setLanguage("ar")}
            className={`${softControlBase} ${language === "ar" ? softToggleActive : softToggleIdle}`}
          >
            العربية
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 mt-8 pt-6 border-t border-[var(--border)]">
        <LogoMark size={32} />
        <p className="text-[15px] font-bold text-[var(--text-primary)]">Tawthiq</p>
        <AppVersion />
      </div>
    </div>
  );
}

function DonneesPanel() {
  const t = useT();
  const { backupIntervalHours, setBackupIntervalHours } = useSessionStore();
  const [backupStatus, setBackupStatus] = useState<string | null>(null);
  const [pinStatus, setPinStatus] = useState<string | null>(null);
  const [showPinForm, setShowPinForm] = useState(false);
  const [oldPinInput, setOldPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [dbPath, setDbPath] = useState<string>("");
  const [restoreConfirm, setRestoreConfirm] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  useEffect(() => {
    api.getDbLocation().then(setDbPath).catch(() => setDbPath(""));
  }, []);

  const handleBackup = async () => {
    const path = await save({
      defaultPath: `tawthiq_backup_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (path) {
      await api.backupDatabase(path);
      setBackupStatus(t("settings.backupDone"));
      setTimeout(() => setBackupStatus(null), 3000);
    }
  };

  const handleRestore = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Database", extensions: ["db"] }],
    });
    if (selected) {
      const path = typeof selected === "string" ? selected : selected;
      setPendingRestore(path);
      setRestoreConfirm(true);
    }
  };

  const confirmRestore = async () => {
    if (!pendingRestore) return;
    setRestoreConfirm(false);
    try {
      await api.restoreDatabase(pendingRestore);
      setBackupStatus(t("settings.restoreDone"));
    } catch {
      setBackupStatus(t("settings.restoreFailed"));
    }
    setPendingRestore(null);
  };

  const handleChangePin = async () => {
    if (!oldPinInput) return;
    const result = await api.verifyPin(oldPinInput);
    if (!result.ok) {
      setPinStatus(t("settings.pinWrong"));
      setTimeout(() => setPinStatus(null), 3000);
      return;
    }
    if (!newPinInput || newPinInput.length !== 4) {
      setPinStatus(t("settings.pinInvalid"));
      setTimeout(() => setPinStatus(null), 3000);
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinStatus(t("settings.pinMismatch"));
      setTimeout(() => setPinStatus(null), 3000);
      return;
    }
    try {
      await api.changePin(oldPinInput, newPinInput);
      setPinStatus(t("settings.pinChanged"));
      setShowPinForm(false);
      setOldPinInput("");
      setNewPinInput("");
      setConfirmPinInput("");
    } catch {
      setPinStatus(t("settings.pinWrong"));
    }
    setTimeout(() => setPinStatus(null), 3000);
  };

  return (
    <div className="flex flex-col gap-6">
      <h3 className="text-[18px] font-bold text-[var(--text-primary)]">{t("settings.donnees")}</h3>

      <div className="flex items-center justify-between gap-4 py-5 border-b border-[var(--border)]">
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.backup")}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("settings.backupSub")}</p>
        </div>
        <SoftActionButton onClick={handleBackup} label={t("settings.backupBtn")} variant="primary" />
      </div>

      <div className="flex items-center justify-between gap-4 py-5 border-b border-[var(--border)]">
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.restore")}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("settings.restoreSub")}</p>
        </div>
        <SoftActionButton onClick={handleRestore} label={t("settings.restoreBtn")} variant="muted" />
      </div>

      <div className="flex items-center justify-between gap-4 py-5 border-b border-[var(--border)]">
        <div>
          <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.autoBackup")}</p>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("settings.autoBackupSub")}</p>
        </div>
        <select
          value={backupIntervalHours}
          onChange={(e) => setBackupIntervalHours(Number(e.target.value))}
          className={`${softControlBase} ${softToggleIdle} cursor-pointer outline-none`}
        >
          <option value={0}>{t("settings.autoBackupOff")}</option>
          <option value={1}>1h</option>
          <option value={4}>4h</option>
          <option value={8}>8h</option>
          <option value={24}>24h</option>
        </select>
      </div>

      {backupStatus && (
        <p className="text-[14px] font-medium text-[var(--green)]">{backupStatus}</p>
      )}

      <div className="py-5 border-b border-[var(--border)]">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">{t("settings.pin")}</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">{t("settings.pinSub")}</p>
          </div>
          {!showPinForm && (
            <SoftActionButton
              onClick={() => setShowPinForm(true)}
              label={t("settings.pinChange")}
              variant="muted"
              icon={<GearIcon size={16} color="currentColor" />}
            />
          )}
        </div>

        {showPinForm && (
          <div className="mt-4 flex flex-col gap-3 p-5 bg-[var(--bg-app)] rounded-2xl border border-[var(--border)]">
            <div>
              <label className="text-[13px] text-[var(--text-secondary)] mb-1.5 block">{t("settings.pinOld")}</label>
              <input
                type="password"
                maxLength={4}
                value={oldPinInput}
                onChange={(e) => setOldPinInput(e.target.value.replace(/\D/g, ""))}
                className="w-44 px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[15px] font-mono tracking-[0.5em] outline-none focus:border-[var(--teal)] num-ltr"
                autoFocus
              />
            </div>
            <div>
              <label className="text-[13px] text-[var(--text-secondary)] mb-1.5 block">{t("settings.pinNew")}</label>
              <input
                type="password"
                maxLength={4}
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, ""))}
                className="w-44 px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[15px] font-mono tracking-[0.5em] outline-none focus:border-[var(--teal)] num-ltr"
              />
            </div>
            <div>
              <label className="text-[13px] text-[var(--text-secondary)] mb-1.5 block">{t("settings.pinNewConfirm")}</label>
              <input
                type="password"
                maxLength={4}
                value={confirmPinInput}
                onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, ""))}
                className="w-44 px-3 py-2.5 bg-[var(--bg-card)] border border-[var(--border)] rounded-lg text-[15px] font-mono tracking-[0.5em] outline-none focus:border-[var(--teal)] num-ltr"
              />
            </div>
            <div className="flex gap-2 mt-1">
              <SoftActionButton onClick={handleChangePin} label={t("settings.pinConfirm")} variant="primary" />
              <SoftActionButton
                onClick={() => { setShowPinForm(false); setOldPinInput(""); setNewPinInput(""); setConfirmPinInput(""); }}
                label={t("settings.pinCancel")}
                variant="muted"
              />
            </div>
          </div>
        )}
      </div>

      {pinStatus && (
        <p className={`text-[14px] font-medium ${
          pinStatus === t("settings.pinChanged") ? "text-[var(--green)]" : "text-[var(--red)]"
        }`}>{pinStatus}</p>
      )}

      {restoreConfirm && (
        <div className="rounded-xl border border-[var(--red)]/30 bg-[var(--red-bg)] p-4 flex flex-col gap-3">
          <p className="text-[14px] font-semibold text-[var(--red)]">{t("settings.restoreWarn")}</p>
          <div className="flex gap-2">
            <SoftActionButton onClick={confirmRestore} label={t("settings.restoreConfirm")} variant="primary" />
            <SoftActionButton onClick={() => { setRestoreConfirm(false); setPendingRestore(null); }} label={t("settings.pinCancel")} variant="muted" />
          </div>
        </div>
      )}

      <div className="py-3">
        <p className="text-[13px] text-[var(--text-faint)]">{t("settings.dbLocal")}</p>
        {dbPath && <p className="text-[12px] text-[var(--text-faint)] mt-1 break-all num-ltr">{dbPath}</p>}
      </div>
    </div>
  );
}

function AProposPanel() {
  const t = useT();
  const [installId, setInstallId] = useState("");
  useEffect(() => {
    api.getInstallId().then(setInstallId).catch(() => setInstallId(""));
  }, []);
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 py-10">
      <LogoMark size={64} />
      <h2 className="text-[24px] font-[800] text-[var(--text-primary)]">Tawthiq</h2>
      <p className="text-[15px] text-[var(--text-secondary)] text-center max-w-[320px] leading-relaxed">
        {t("settings.aboutDesc")}
      </p>
      <div className="flex flex-col items-center gap-1 mt-4">
        <AppVersion />
        <p className="text-[13px] text-[var(--text-faint)]">Tauri 2 + React + SQLite</p>
        <p className="text-[12px] text-[var(--green)] font-semibold mt-2">{t("settings.accessOk")}</p>
      </div>
      {installId && (
        <div className="mt-4 w-full max-w-[420px] rounded-xl border border-[var(--border)] bg-[var(--bg-app)] p-4 text-center">
          <p className="text-[13px] font-semibold text-[var(--text-primary)]">{t("settings.installId")}</p>
          <p className="text-[12px] text-[var(--text-faint)] mt-1">{t("settings.installIdSub")}</p>
          <p className="text-[12px] font-mono text-[var(--text-primary)] mt-2 break-all num-ltr select-all">{installId}</p>
        </div>
      )}
    </div>
  );
}

function AppVersion() {
  const [version, setVersion] = useState("…");
  useEffect(() => {
    api.getAppVersion().then(setVersion).catch(() => setVersion("1.0.0"));
  }, []);
  return <p className="text-[13px] text-[var(--text-faint)] num-ltr">Version {version}</p>;
}
