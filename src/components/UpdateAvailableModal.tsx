import { SoftActionButton } from "@/components/SoftActionButton";
import { useT } from "@/i18n/useT";

export function UpdateAvailableModal({
  version,
  updating,
  onInstall,
  onLater,
}: {
  version: string;
  updating: boolean;
  onInstall: () => void;
  onLater: () => void;
}) {
  const t = useT();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{t("update.title")}</h2>
          <p className="text-[14px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {t("update.available").replace("{v}", version)}
          </p>
          <p className="text-[13px] text-[var(--text-faint)] mt-2">{t("update.hint")}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <SoftActionButton
            onClick={onInstall}
            label={updating ? "…" : t("update.install")}
            variant="primary"
            disabled={updating}
          />
          <SoftActionButton onClick={onLater} label={t("update.later")} variant="muted" disabled={updating} />
        </div>
      </div>
    </div>
  );
}
