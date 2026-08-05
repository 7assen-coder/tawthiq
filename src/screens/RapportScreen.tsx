import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDataStore } from "@/stores/dataStore";
import { useSessionStore } from "@/stores/sessionStore";
import { useCountUp } from "@/hooks/useCountUp";
import { CAS_CONFIGS } from "@/types";
import type { CasType, ComparisonResult, ImportMode, SheetPreview, SourceCounts, SuggestedColumnMap } from "@/types";
import { formatMoney } from "@/lib/utils";
import { incomingPreviewCounts, resolveSheetMap, sheetKey, sheetNeedsMapping, toImportMaps } from "@/lib/columnMaps";
import { getCasIcon, DownloadIcon, SearchIcon, FileIcon } from "@/components/icons";
import { SoftActionButton } from "@/components/SoftActionButton";
import { ImportConflictModal } from "@/components/ImportConflictModal";
import { ColumnMappingModal } from "@/components/ColumnMappingModal";
import * as api from "@/services/tauriAdapter";
import { save, open } from "@tauri-apps/plugin-dialog";
import { useT } from "@/i18n/useT";
import type { TKey } from "@/i18n/translations";

const DETAIL_PAGE_SIZE = 30;

function StatCard({ label, value, accent, bg, subtitle }: {
  label: string; value: number; accent: string; bg: string; subtitle: string;
}) {
  const display = useCountUp(value, 1500);
  return (
    <div
      className="flex-1 rounded-2xl border border-[var(--border)] min-h-[148px] shadow-sm"
      style={{
        backgroundColor: bg,
        borderLeftWidth: 5,
        borderLeftColor: accent,
      }}
    >
      <div className="h-full flex flex-col justify-between gap-4 px-8 py-7">
        <p className="text-[13px] font-bold tracking-wider uppercase" style={{ color: accent }}>
          {label}
        </p>
        <p className="text-[36px] font-[800] tabular-nums num-ltr leading-none text-[var(--text-primary)]">
          {formatMoney(display)}
        </p>
        <p className="text-[13px] font-medium text-[var(--text-secondary)]">{subtitle}</p>
      </div>
    </div>
  );
}

function ConformityDonut({ percentage, label }: { percentage: number; label: string }) {
  const display = useCountUp(percentage, 1500);
  const size = 140;
  const r = 54;
  const cx = size / 2;
  const circ = 2 * Math.PI * r;
  const filled = (percentage / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center gap-3 shrink-0 rounded-2xl bg-[var(--bg-card)] border border-[var(--border)] px-8 py-6 shadow-sm min-w-[188px]">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
        <motion.circle
          cx={cx} cy={cx} r={r} fill="none"
          stroke="var(--green)" strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ}
          animate={{ strokeDashoffset: circ - filled }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
        <text x={cx} y={cx} textAnchor="middle" dominantBaseline="central"
          className="text-[30px] font-[800] fill-[var(--text-primary)]"
          style={{ direction: "ltr", unicodeBidi: "isolate" }}>
          {display}%
        </text>
      </svg>
      <p className="text-[14px] text-[var(--text-secondary)] font-semibold text-center px-2">{label}</p>
    </div>
  );
}

export function RapportScreen() {
  const { compareResult, selectedCas, setSelectedCas, setCompareResult, compareStale } = useDataStore();
  const { currentSession } = useSessionStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [isComparing, setIsComparing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entryCounts, setEntryCounts] = useState({ olivex_count: 0, cnam_count: 0 });
  const [hydrating, setHydrating] = useState(true);
  const [pendingPaths, setPendingPaths] = useState<string[] | null>(null);
  const [pendingSheets, setPendingSheets] = useState<SheetPreview[] | null>(null);
  const [mapOverrides, setMapOverrides] = useState<Record<string, SuggestedColumnMap>>({});
  const [showMapping, setShowMapping] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [sourceCounts, setSourceCounts] = useState<SourceCounts | null>(null);
  const t = useT();

  const canCompareImported = entryCounts.cnam_count > 0 && entryCounts.olivex_count > 0;

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      const session = useSessionStore.getState().currentSession;
      if (!session) {
        setHydrating(false);
        return;
      }
      try {
        const [counts, stored] = await Promise.all([
          api.getEntryCounts(session.id),
          compareResult ? Promise.resolve(null) : api.getLatestCompareResult(session.id),
        ]);
        if (cancelled) return;
        setEntryCounts(counts);
        if (!compareResult && stored) {
          setCompareResult(stored);
        }
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
      if (!cancelled) setHydrating(false);
    }
    hydrate();
    return () => { cancelled = true; };
  }, [currentSession?.id]);

  const refreshCounts = async () => {
    const session = useSessionStore.getState().currentSession;
    if (!session) return;
    setEntryCounts(await api.getEntryCounts(session.id));
  };

  const runCompareOnly = async () => {
    const session = useSessionStore.getState().currentSession;
    if (!session) return;
    setIsComparing(true);
    setError(null);
    try {
      const counts = await api.getEntryCounts(session.id);
      setEntryCounts(counts);
      if (counts.olivex_count === 0 || counts.cnam_count === 0) {
        setError(t("rapport.needBothSources"));
        setIsComparing(false);
        return;
      }
      const result = await api.runComparison(session.id);
      setCompareResult(result);
      setSelectedCas(null);
      setSearchQuery("");
    } catch (e) {
      setError(`${t("rapport.compareError")}: ${String(e)}`);
    }
    setIsComparing(false);
  };

  const importThenCompare = async (paths: string[], mode: ImportMode, sheets: SheetPreview[], overrides: Record<string, SuggestedColumnMap>) => {
    const session = useSessionStore.getState().currentSession;
    if (!session) return;
    setIsComparing(true);
    setError(null);
    try {
      const maps = toImportMaps(sheets, overrides);
      const imported = await api.importExcelFiles(paths, session.id, mode, maps);
      await refreshCounts();
      if (imported.olivex_count === 0 || imported.cnam_count === 0) {
        const totals = await api.getEntryCounts(session.id);
        if (totals.olivex_count === 0 || totals.cnam_count === 0) {
          setCompareResult(null);
          setSelectedCas(null);
          setError(t("rapport.missingSources"));
          setIsComparing(false);
          return;
        }
      }
      const result = await api.runComparison(session.id);
      setCompareResult(result);
      setSelectedCas(null);
      setSearchQuery("");
    } catch (e) {
      setError(`${t("rapport.compareError")}: ${String(e)}`);
    }
    setPendingPaths(null);
    setPendingSheets(null);
    setIsComparing(false);
  };

  const startFileCompare = async () => {
    const session = useSessionStore.getState().currentSession;
    if (!session) return;
    const selected = await open({
      multiple: true,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;

    setError(null);
    try {
      const allSheets: SheetPreview[] = [];
      for (const path of paths) {
        const preview = await api.previewExcel(path);
        for (const sheet of preview.sheets) {
          allSheets.push({
            ...sheet,
            original_name: sheet.original_name || sheet.name,
            file_path: sheet.file_path || path,
          });
        }
      }
      const initial: Record<string, SuggestedColumnMap> = {};
      for (const sheet of allSheets) {
        initial[sheetKey(sheet)] = resolveSheetMap(sheet);
      }
      setPendingPaths(paths);
      setPendingSheets(allSheets);
      setMapOverrides(initial);
      if (allSheets.some(sheetNeedsMapping)) {
        setShowMapping(true);
        return;
      }
      await continueAfterMapping(paths, allSheets, initial);
    } catch (e) {
      setError(String(e));
    }
  };

  const continueAfterMapping = async (
    paths: string[],
    sheets: SheetPreview[],
    overrides: Record<string, SuggestedColumnMap>,
  ) => {
    const session = useSessionStore.getState().currentSession;
    if (!session) return;
    try {
      const counts = await api.getSourceCounts(session.id);
      if (counts.cnam_imported + counts.olivex_imported > 0) {
        setSourceCounts(counts);
        setPendingPaths(paths);
        setPendingSheets(sheets);
        setMapOverrides(overrides);
        setShowConflict(true);
        return;
      }
      await importThenCompare(paths, "replace", sheets, overrides);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleNewCompare = async () => {
    setSearchQuery("");
    setError(null);
    await startFileCompare();
  };

  const handleExportAll = async () => {
    const sessionId = useSessionStore.getState().currentSession?.id;
    if (!sessionId) return;
    const path = await save({
      defaultPath: `rapport_complet.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      await api.exportFullReport(sessionId, path);
    } catch (e) {
      console.error("Export all failed:", e);
    }
    setIsExporting(false);
  };

  const handleExportSelectedCase = async () => {
    if (!selectedCas) return;
    const sessionId = useSessionStore.getState().currentSession?.id;
    if (!sessionId) return;
    const path = await save({
      defaultPath: `${selectedCas}_export.xlsx`,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!path) return;
    setIsExporting(true);
    try {
      await api.exportCaseToExcel(sessionId, selectedCas, path);
    } catch (e) {
      console.error("Export case failed:", e);
    }
    setIsExporting(false);
  };

  if (hydrating) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--teal)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!compareResult) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-6">
        {showMapping && pendingSheets && (
          <ColumnMappingModal
            sheets={pendingSheets}
            initial={mapOverrides}
            onCancel={() => { setShowMapping(false); setPendingPaths(null); setPendingSheets(null); }}
            onConfirm={(maps) => {
              setMapOverrides(maps);
              setShowMapping(false);
              if (pendingPaths) continueAfterMapping(pendingPaths, pendingSheets, maps);
            }}
          />
        )}
        {showConflict && sourceCounts && pendingPaths && pendingSheets && (
          <ImportConflictModal
            existing={sourceCounts}
            incoming={incomingPreviewCounts(pendingSheets)}
            onCancel={() => setShowConflict(false)}
            onReplace={() => {
              setShowConflict(false);
              importThenCompare(pendingPaths, "replace", pendingSheets, mapOverrides);
            }}
            onMerge={() => {
              setShowConflict(false);
              importThenCompare(pendingPaths, "merge", pendingSheets, mapOverrides);
            }}
          />
        )}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-3xl flex flex-col items-center gap-8 rounded-3xl border-2 border-dashed border-[var(--teal)]/45 bg-[var(--bg-card)] px-10 py-14 shadow-sm"
        >
          <div className="w-28 h-28 rounded-3xl bg-[var(--teal-light)] flex items-center justify-center">
            <FileIcon size={52} color="var(--teal)" />
          </div>
          <div className="text-center max-w-xl">
            <p className="text-[26px] font-bold text-[var(--text-primary)]">
              {t("rapport.noResultTitle")}
            </p>
            <p className="text-[17px] text-[var(--text-secondary)] mt-3 leading-relaxed">
              {t("rapport.noResultSub")}
            </p>
          </div>
          {error && (
            <div className="w-full max-w-xl rounded-2xl bg-[var(--red-bg)] border border-[var(--red)]/30 px-6 py-4 text-[16px] font-semibold text-[var(--red)] text-center">
              {error}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <SoftActionButton
              onClick={runCompareOnly}
              disabled={isComparing || !canCompareImported}
              label={isComparing ? t("saisie.comparing") : t("rapport.compareImported")}
              variant="primary"
            />
            <SoftActionButton
              onClick={startFileCompare}
              disabled={isComparing}
              icon={<FileIcon size={17} color="currentColor" />}
              label={t("rapport.compareFiles")}
              variant="muted"
            />
          </div>
        </motion.div>
      </div>
    );
  }

  const cc = compareResult.cas_counts;
  const totalGroups = cc.cas1 + cc.cas2 + cc.cas3 + cc.cas4 + cc.cas5 + cc.cas6 + cc.cas7;
  const conformity = totalGroups > 0
    ? Math.round(((cc.cas1 + cc.cas2 + cc.cas7) / totalGroups) * 100)
    : Math.round(compareResult.conformity_rate);

  const casEntries: { type: CasType; count: number }[] = [
    { type: "cas1", count: cc.cas1 },
    { type: "cas2", count: cc.cas2 },
    { type: "cas3", count: cc.cas3 },
    { type: "cas4", count: cc.cas4 },
    { type: "cas5", count: cc.cas5 },
    { type: "cas6", count: cc.cas6 },
    { type: "cas7", count: cc.cas7 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
      className="h-full flex flex-col gap-6 overflow-y-auto pb-4"
    >
      {showMapping && pendingSheets && (
        <ColumnMappingModal
          sheets={pendingSheets}
          initial={mapOverrides}
          onCancel={() => { setShowMapping(false); setPendingPaths(null); setPendingSheets(null); }}
          onConfirm={(maps) => {
            setMapOverrides(maps);
            setShowMapping(false);
            if (pendingPaths) continueAfterMapping(pendingPaths, pendingSheets, maps);
          }}
        />
      )}
      {showConflict && sourceCounts && pendingPaths && pendingSheets && (
        <ImportConflictModal
          existing={sourceCounts}
          incoming={incomingPreviewCounts(pendingSheets)}
          onCancel={() => setShowConflict(false)}
          onReplace={() => {
            setShowConflict(false);
            importThenCompare(pendingPaths, "replace", pendingSheets, mapOverrides);
          }}
          onMerge={() => {
            setShowConflict(false);
            importThenCompare(pendingPaths, "merge", pendingSheets, mapOverrides);
          }}
        />
      )}

      {compareStale && (
        <div className="rounded-xl border border-[var(--amber)]/30 bg-[var(--amber-bg)] px-5 py-3 text-[14px] font-semibold text-[var(--amber-dark)]">
          {t("rapport.stale")}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-[var(--red-bg)] border border-[var(--red)]/30 px-5 py-3 text-[14px] font-semibold text-[var(--red)]">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-[15px] text-[var(--text-secondary)] font-medium">
          {t("rapport.repartition")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <SoftActionButton
            onClick={runCompareOnly}
            disabled={isComparing || isExporting || !canCompareImported}
            label={isComparing ? t("saisie.comparing") : t("rapport.recalc")}
            variant="primary"
          />
          <SoftActionButton
            onClick={handleNewCompare}
            disabled={isComparing || isExporting}
            icon={<FileIcon size={17} color="currentColor" />}
            label={t("rapport.newCompare")}
            variant="muted"
          />
          <SoftActionButton
            onClick={handleExportSelectedCase}
            disabled={!selectedCas || isExporting || isComparing}
            icon={<DownloadIcon size={17} color="currentColor" />}
            label={isExporting ? t("rapport.exporting") : t("rapport.exportCase")}
            variant="muted"
          />
          <SoftActionButton
            onClick={handleExportAll}
            disabled={isExporting || isComparing}
            icon={<DownloadIcon size={17} color="currentColor" />}
            label={isExporting ? t("rapport.exporting") : t("rapport.exportAll")}
            variant="primary"
          />
        </div>
      </div>

      <div className="flex gap-5 items-stretch">
        <ConformityDonut percentage={conformity} label={t("rapport.conformite")} />
        <StatCard
          label={t("rapport.totalManque")}
          value={compareResult.total_manque}
          accent="var(--red)"
          bg="var(--red-bg)"
          subtitle="Cas3 + Cas4"
        />
        <StatCard
          label={t("rapport.totalSurplus")}
          value={compareResult.total_surplus}
          accent="var(--indigo)"
          bg="var(--indigo-bg)"
          subtitle="Cas3 + Cas4"
        />
      </div>

      <div className="grid grid-cols-7 gap-3">
        {casEntries.map(({ type, count }) => {
          const cfg = CAS_CONFIGS.find(c => c.type === type)!;
          const isSelected = selectedCas === type;
          return (
            <motion.button
              key={type}
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setSelectedCas(isSelected ? null : type)}
              className={`rounded-2xl text-left transition-all min-h-[140px] box-border ${
                isSelected
                  ? "border shadow-sm"
                  : "border border-[var(--border)] hover:border-[var(--text-faint)]"
              }`}
              style={{
                borderColor: isSelected ? cfg.color : undefined,
                backgroundColor: isSelected ? `${cfg.color}10` : "var(--bg-card)",
                padding: "20px 18px",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-4"
                style={{ backgroundColor: `${cfg.color}16` }}
              >
                {getCasIcon(cfg.icon, 16, cfg.color)}
              </div>
              <p
                className="text-[12px] font-semibold leading-snug mb-3 line-clamp-2"
                style={{ color: isSelected ? cfg.color : "var(--text-secondary)" }}
              >
                {t(cfg.label as TKey)}
              </p>
              <p className="text-[26px] font-[800] text-[var(--text-primary)] tabular-nums num-ltr leading-none">
                {count}
              </p>
              <p className="text-[12px] text-[var(--text-faint)] mt-2.5">{t("rapport.dossiers")}</p>
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {selectedCas && (
          <CasDetailTable
            key={selectedCas}
            casType={selectedCas}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CasDetailTable({ casType, searchQuery, onSearchChange }: {
  casType: CasType;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}) {
  const cfg = CAS_CONFIGS.find(c => c.type === casType)!;
  const t = useT();
  const { currentSession } = useSessionStore();
  const [page, setPage] = useState(0);
  const [pagedRows, setPagedRows] = useState<ComparisonResult[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);

  useEffect(() => {
    if (!currentSession) return;
    let cancelled = false;
    void (async () => {
      const result = await api.getComparisonResults(
        currentSession.id,
        casType,
        page * DETAIL_PAGE_SIZE,
        DETAIL_PAGE_SIZE,
        searchQuery.trim() || null
      );
      if (cancelled) return;
      setPagedRows(result.entries);
      setFilteredTotal(result.total);
      setTotalAmount(result.total_difference);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSession, casType, page, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / DETAIL_PAGE_SIZE));
  const isCas5 = casType === "cas5";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 flex flex-col bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] overflow-hidden min-h-[380px] shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-5 px-6 py-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3.5 shrink-0 min-w-0">
          <div className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
          <div>
            <p className="text-[16px] font-bold text-[var(--text-primary)] leading-tight">
              {t(cfg.label as TKey)}
            </p>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1">
              <span className="num-ltr">{filteredTotal}</span> {t("rapport.dossiers")} · <span className="num-ltr">{formatMoney(totalAmount)}</span>
            </p>
          </div>
        </div>

        <div className="flex-1 flex items-center gap-3 min-h-[44px] min-w-[240px] bg-[var(--bg-app)] rounded-lg px-4 border border-[var(--border)]">
          <SearchIcon size={18} color="var(--text-faint)" />
          <input
            type="text"
            placeholder={t("rapport.search")}
            value={searchQuery}
            onChange={(e) => { onSearchChange(e.target.value); setPage(0); }}
            className="bg-transparent text-[15px] outline-none flex-1 min-w-0 text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
          />
          {searchQuery && (
            <button
              onClick={() => { onSearchChange(""); setPage(0); }}
              className="text-[var(--text-faint)] hover:text-[var(--text-primary)] text-[18px] font-bold px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[15px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[var(--bg-app)]">
              <th className="px-6 py-4 text-left font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colNni")}</th>
              <th className="px-6 py-4 text-left font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colFicheOlivex")}</th>
              <th className="px-6 py-4 text-left font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colFicheCnam")}</th>
              <th className="px-6 py-4 text-right font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colMontOlivex")}</th>
              <th className="px-6 py-4 text-right font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colMontCnam")}</th>
              <th className="px-6 py-4 text-right font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colDiff")}</th>
              {isCas5 && (
                <>
                  <th className="px-6 py-4 text-left font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colStatut")}</th>
                  <th className="px-6 py-4 text-left font-semibold text-[var(--text-secondary)] border-b border-[var(--border)]">{t("rapport.colNotes")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 && (
              <tr>
                <td colSpan={isCas5 ? 8 : 6} className="text-center py-16 text-[var(--text-faint)] text-[16px]">
                  {t("rapport.noResults")}
                </td>
              </tr>
            )}
            {pagedRows.map((r, i) => (
              <CasDetailRow key={`${r.nni}-${i}`} result={r} isCas5={isCas5} />
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--border)]">
          <p className="text-[14px] text-[var(--text-faint)] font-medium">
            {filteredTotal === 0 ? 0 : page * DETAIL_PAGE_SIZE + 1}–{Math.min((page + 1) * DETAIL_PAGE_SIZE, filteredTotal)} / {filteredTotal}
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-5 py-2.5 rounded-xl text-[14px] font-bold bg-[var(--bg-app)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] disabled:opacity-30 transition-all"
            >
              ← Préc.
            </button>
            <span className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums num-ltr px-2">
              {page + 1} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-5 py-2.5 rounded-xl text-[14px] font-bold bg-[var(--bg-app)] border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--border)] disabled:opacity-30 transition-all"
            >
              Suiv. →
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CasDetailRow({ result, isCas5 }: { result: ComparisonResult; isCas5: boolean }) {
  const [status, setStatus] = useState(result.resolution_status || "En attente");
  const [notes, setNotes] = useState(result.notes || "");
  const t = useT();

  const handleStatusChange = async (newStatus: string) => {
    setStatus(newStatus);
    if (result.id) {
      await api.updateResolution(result.id, newStatus, notes);
    }
  };

  const handleNotesBlur = async () => {
    if (result.id) {
      await api.updateResolution(result.id, status, notes);
    }
  };

  return (
    <tr className="hover:bg-[var(--bg-app)]/50 transition-colors">
      <td className="px-6 py-3.5 border-b border-[var(--border)]/30 font-medium">{result.nni}</td>
      <td className="px-6 py-3.5 border-b border-[var(--border)]/30">{result.fiche_olivex || "—"}</td>
      <td className="px-6 py-3.5 border-b border-[var(--border)]/30">{result.fiche_cnam || "—"}</td>
      <td className="px-6 py-3.5 border-b border-[var(--border)]/30 text-right tabular-nums num-ltr">
        {result.montant_olivex > 0 ? formatMoney(result.montant_olivex) : "—"}
      </td>
      <td className="px-6 py-3.5 border-b border-[var(--border)]/30 text-right tabular-nums num-ltr">
        {result.montant_cnam > 0 ? formatMoney(result.montant_cnam) : "—"}
      </td>
      <td className={`px-6 py-3.5 border-b border-[var(--border)]/30 text-right tabular-nums num-ltr font-semibold ${
        result.difference > 0 ? "text-[var(--indigo)]" : result.difference < 0 ? "text-[var(--red)]" : ""
      }`}>
        {result.difference !== 0
          ? `${result.difference > 0 ? "+" : ""}${formatMoney(result.difference)}`
          : "—"}
      </td>
      {isCas5 && (
        <>
          <td className="px-6 py-3.5 border-b border-[var(--border)]/30">
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              className={`text-[14px] font-bold px-4 py-2 rounded-xl border-none outline-none cursor-pointer ${
                status === "Résolu"
                  ? "bg-[var(--green-bg)] text-[var(--green)]"
                  : status === "Ignoré"
                  ? "bg-[var(--red-bg)] text-[var(--red)]"
                  : "bg-[var(--amber-bg)] text-[var(--amber)]"
              }`}
            >
              <option value="En attente">{t("rapport.enAttente")}</option>
              <option value="Résolu">{t("rapport.resolu")}</option>
              <option value="Ignoré">{t("rapport.ignore")}</option>
            </select>
          </td>
          <td className="px-6 py-3.5 border-b border-[var(--border)]/30">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder={t("rapport.addNote")}
              className="text-[15px] bg-transparent outline-none w-full text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
            />
          </td>
        </>
      )}
    </tr>
  );
}
