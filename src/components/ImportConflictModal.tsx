import { SoftActionButton } from "@/components/SoftActionButton";
import type { SourceCounts } from "@/types";
import { useT } from "@/i18n/useT";

export function ImportConflictModal({
  existing,
  incoming,
  onReplace,
  onMerge,
  onCancel,
}: {
  existing: SourceCounts;
  incoming: { cnam: number; olivex: number };
  onReplace: () => void;
  onMerge: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const importedTotal = existing.cnam_imported + existing.olivex_imported;
  const manualTotal = existing.cnam_manual + existing.olivex_manual;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl p-6 flex flex-col gap-5">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{t("import.conflictTitle")}</h2>
          <p className="text-[14px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {t("import.conflictSub")}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
            <p className="font-semibold text-[var(--text-secondary)] mb-1">{t("import.inDb")}</p>
            <p className="text-[var(--text-primary)] num-ltr">
              {t("import.imported")}: {importedTotal}
            </p>
            <p className="text-[var(--text-faint)] num-ltr">
              CNAM {existing.cnam_imported} · OLIVEX {existing.olivex_imported}
            </p>
            <p className="text-[var(--text-faint)] mt-1 num-ltr">
              {t("import.manual")}: {manualTotal}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-app)] px-4 py-3">
            <p className="font-semibold text-[var(--text-secondary)] mb-1">{t("import.inFile")}</p>
            <p className="text-[var(--text-primary)] num-ltr">
              {incoming.cnam + incoming.olivex} {t("saisie.lines")}
            </p>
            <p className="text-[var(--text-faint)] num-ltr">
              CNAM {incoming.cnam} · OLIVEX {incoming.olivex}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            onClick={onReplace}
            className="text-start rounded-xl border border-[var(--border)] px-4 py-3 hover:bg-[var(--red-bg)] transition-colors"
          >
            <p className="text-[14px] font-bold text-[var(--red)]">{t("import.replace")}</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{t("import.replaceHelp")}</p>
          </button>
          <button
            onClick={onMerge}
            className="text-start rounded-xl border border-[var(--border)] px-4 py-3 hover:bg-[var(--teal-light)] transition-colors"
          >
            <p className="text-[14px] font-bold text-[var(--teal)]">{t("import.merge")}</p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{t("import.mergeHelp")}</p>
          </button>
        </div>

        <div className="flex justify-end">
          <SoftActionButton onClick={onCancel} label={t("saisie.cancel")} variant="muted" />
        </div>
      </div>
    </div>
  );
}
