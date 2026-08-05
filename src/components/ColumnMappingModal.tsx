import { useState } from "react";
import { SoftActionButton, softControlBase, softToggleActive, softToggleIdle } from "@/components/SoftActionButton";
import type { SheetPreview, SuggestedColumnMap } from "@/types";
import type { SourceKind } from "@/lib/columnMaps";
import { resolveSheetMap, sheetKey } from "@/lib/columnMaps";
import { useT } from "@/i18n/useT";

export function ColumnMappingModal({
  sheets,
  initial,
  onConfirm,
  onCancel,
}: {
  sheets: SheetPreview[];
  initial: Record<string, SuggestedColumnMap>;
  onConfirm: (maps: Record<string, SuggestedColumnMap>) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [maps, setMaps] = useState(() => {
    const next = { ...initial };
    for (const s of sheets) {
      const k = sheetKey(s);
      if (!next[k]) next[k] = resolveSheetMap(s);
    }
    return next;
  });
  const [active, setActive] = useState(0);
  const sheet = sheets[active];
  const key = sheet ? sheetKey(sheet) : "";
  const current = maps[key];

  const update = (patch: Partial<SuggestedColumnMap>) => {
    if (!sheet) return;
    const nextSource = (patch.source ?? current?.source ?? sheet.detected_type) as string;
    const nni = patch.nni !== undefined ? patch.nni : current?.nni ?? null;
    const fiche = patch.fiche !== undefined ? patch.fiche : current?.fiche ?? null;
    const montant = patch.montant !== undefined ? patch.montant : current?.montant ?? null;
    setMaps({
      ...maps,
      [key]: {
        source: nextSource,
        nni,
        fiche,
        montant,
        complete: nni !== null && fiche !== null && montant !== null && (nextSource === "cnam" || nextSource === "olivex"),
      },
    });
  };

  const allReady = sheets.every((s) => maps[sheetKey(s)]?.complete);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] shadow-2xl p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--text-primary)]">{t("import.mapTitle")}</h2>
          <p className="text-[14px] text-[var(--text-secondary)] mt-2">{t("import.mapSub")}</p>
        </div>

        {sheets.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {sheets.map((s, i) => (
              <button
                key={sheetKey(s)}
                onClick={() => setActive(i)}
                className={`${softControlBase} h-10 ${active === i ? softToggleActive : softToggleIdle}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        )}

        {sheet && current && (
          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {(["cnam", "olivex"] as SourceKind[]).map((src) => (
                <button
                  key={src}
                  onClick={() => update({ source: src })}
                  className={`${softControlBase} ${current.source === src ? softToggleActive : softToggleIdle}`}
                >
                  {src.toUpperCase()}
                </button>
              ))}
            </div>

            <FieldSelect
              label={t("import.mapNni")}
              headers={sheet.headers}
              value={current.nni}
              onChange={(nni) => update({ nni })}
            />
            <FieldSelect
              label={t("import.mapFiche")}
              headers={sheet.headers}
              value={current.fiche}
              onChange={(fiche) => update({ fiche })}
            />
            <FieldSelect
              label={t("import.mapMontant")}
              headers={sheet.headers}
              value={current.montant}
              onChange={(montant) => update({ montant })}
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <SoftActionButton onClick={onCancel} label={t("saisie.cancel")} variant="muted" />
          <SoftActionButton
            onClick={() => onConfirm(maps)}
            disabled={!allReady}
            label={t("import.mapConfirm")}
            variant="primary"
          />
        </div>
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: number | null;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-[var(--text-secondary)]">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[14px] text-[var(--text-primary)] outline-none focus:border-[var(--teal)]"
      >
        <option value="" disabled>
          —
        </option>
        {headers.map((h, i) => (
          <option key={`${h}-${i}`} value={i}>
            {h || `(col ${i + 1})`}
          </option>
        ))}
      </select>
    </label>
  );
}
