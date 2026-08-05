import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSessionStore } from "@/stores/sessionStore";
import { useDataStore } from "@/stores/dataStore";
import { useUiDraftStore, type ImportDraft } from "@/stores/uiDraftStore";
import { FileIcon, SearchIcon } from "@/components/icons";
import { SoftActionButton, softControlBase, softToggleActive, softToggleIdle } from "@/components/SoftActionButton";
import { ImportConflictModal } from "@/components/ImportConflictModal";
import { ColumnMappingModal } from "@/components/ColumnMappingModal";
import * as api from "@/services/tauriAdapter";
import type { ImportPreview, EntryCounts, OlivexEntry, CnamEntry, ImportMode, SourceCounts, SuggestedColumnMap, SheetPreview } from "@/types";
import { incomingPreviewCounts, resolveSheetMap, sheetKey, sheetNeedsMapping, toImportMaps } from "@/lib/columnMaps";
import { open } from "@tauri-apps/plugin-dialog";
import { useT } from "@/i18n/useT";

const ROWS_PER_PAGE = 28;

const CNAM_HIDDEN_HEADERS = ["path"];
const CNAM_COLS = ["N", "Code FS", "Type Auth", "INAM", "Code", "Prestation", "QT", "Montant", "User Bio", "Date OP"];
const CNAM_FIELDS = ["num", "code_fs", "type_auth", "nni", "code", "prestation", "quantite", "montant", "user_bio", "date_op"];
const OLIVEX_COLS = ["Ref.", "Organisme", "Date", "N° PC", "N° feuille", "Nature", "Mnt. total"];
const OLIVEX_FIELDS = ["ref_code", "organisme", "date", "nni", "num_feuille", "nature", "montant"];

function filterColumns(
  headers: string[],
  rows: string[][],
  sheetType: string
): { headers: string[]; rows: string[][] } {
  if (sheetType.toLowerCase() !== "cnam") return { headers, rows };
  const keepIndices: number[] = [];
  headers.forEach((h, i) => {
    if (!CNAM_HIDDEN_HEADERS.includes(h.toLowerCase().trim())) {
      keepIndices.push(i);
    }
  });
  if (keepIndices.length === headers.length) return { headers, rows };
  return {
    headers: keepIndices.map((i) => headers[i]),
    rows: rows.map((row) => keepIndices.map((i) => row[i] ?? "")),
  };
}

function canCreateEntry(data: Record<string, string>, source: "cnam" | "olivex"): boolean {
  const nni = data.nni?.trim();
  const fiche = (source === "cnam" ? data.code_fs : data.num_feuille)?.trim();
  const montantRaw = data.montant?.trim();
  const hasMontant = Boolean(montantRaw) && !Number.isNaN(Number(montantRaw));
  return Boolean(nni || fiche || hasMontant);
}

function CellPopup({ value, onClose }: { value: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <motion.div
        ref={ref}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-2xl p-6 max-w-[600px] max-h-[400px] overflow-auto mx-4"
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-[14px] font-bold text-[var(--text-secondary)]">Contenu complet</p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-[var(--bg-app)] text-[var(--text-faint)] hover:text-[var(--text-primary)] flex items-center justify-center text-[18px] font-bold transition-colors"
          >
            ×
          </button>
        </div>
        <p className="text-[15px] text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap break-words">
          {value}
        </p>
      </motion.div>
    </div>
  );
}

function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2 h-11 px-3 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] min-w-[200px] max-w-xs flex-1">
      <SearchIcon size={16} color="var(--text-faint)" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-[14px] outline-none flex-1 min-w-0 text-[var(--text-primary)] placeholder:text-[var(--text-faint)]"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="text-[var(--text-faint)] hover:text-[var(--text-primary)] text-[16px] font-bold px-1"
        >
          ×
        </button>
      )}
    </div>
  );
}

function TablePagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState(String(page + 1));

  useEffect(() => {
    setDraft(String(page + 1));
  }, [page]);

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(0, next), Math.max(0, totalPages - 1));
    onPageChange(clamped);
    setDraft(String(clamped + 1));
  };

  const commitDraft = () => {
    const n = parseInt(draft, 10);
    if (Number.isNaN(n)) {
      setDraft(String(page + 1));
      return;
    }
    goTo(n - 1);
  };

  return (
    <div className="flex items-center gap-2">
      <SoftActionButton
        onClick={() => goTo(0)}
        disabled={page === 0}
        label={t("saisie.pageFirst")}
        variant="muted"
        className="!px-3"
      />
      <SoftActionButton
        onClick={() => goTo(page - 1)}
        disabled={page === 0}
        label="← Préc."
        variant="muted"
      />
      <div className="flex items-center gap-1.5 px-1">
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/\D/g, ""))}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="w-14 h-11 text-center rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[14px] font-semibold text-[var(--text-primary)] tabular-nums num-ltr outline-none focus:border-[var(--teal)]"
          aria-label="Page"
        />
        <span className="text-[14px] font-semibold text-[var(--text-secondary)] tabular-nums num-ltr">
          / {totalPages}
        </span>
      </div>
      <SoftActionButton
        onClick={() => goTo(page + 1)}
        disabled={page >= totalPages - 1}
        label="Suiv. →"
        variant="muted"
      />
      <SoftActionButton
        onClick={() => goTo(totalPages - 1)}
        disabled={page >= totalPages - 1}
        label={t("saisie.pageLast")}
        variant="muted"
        className="!px-3"
      />
    </div>
  );
}

export function SaisieScreen() {
  const mode = useUiDraftStore((s) => s.saisieMode);
  const setMode = useUiDraftStore((s) => s.setSaisieMode);
  const [refreshKey, setRefreshKey] = useState(0);
  const t = useT();

  return (
    <div className="h-full flex flex-col gap-5 min-h-0">
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => setMode("import")}
          className={`${softControlBase} ${
            mode === "import" ? softToggleActive : softToggleIdle
          }`}
        >
          {t("saisie.importExcel")}
        </button>
        <button
          onClick={() => setMode("manuel")}
          className={`${softControlBase} ${
            mode === "manuel" ? softToggleActive : softToggleIdle
          }`}
        >
          {t("saisie.saisieManuelle")}
        </button>
      </div>

      <div className={mode === "import" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
        <ImportMode onImportComplete={() => setRefreshKey((k) => k + 1)} />
      </div>
      <div className={mode === "manuel" ? "flex-1 flex flex-col min-h-0" : "hidden"}>
        <ManuelMode refreshKey={refreshKey} />
      </div>
    </div>
  );
}

function ImportMode({ onImportComplete }: { onImportComplete: () => void }) {
  const { currentSession } = useSessionStore();
  const markCompareStale = useDataStore((s) => s.markCompareStale);
  const savedImport = useUiDraftStore.getState().importDraft;
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [activeSheet, setActiveSheet] = useState(savedImport?.activeSheet ?? 0);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(savedImport?.imported ?? false);
  const [dragOver, setDragOver] = useState(false);
  const [filePaths, setFilePaths] = useState<string[]>(savedImport?.filePaths ?? []);
  const [fileName, setFileName] = useState(savedImport?.fileName ?? "");
  const [page, setPage] = useState(savedImport?.page ?? 0);
  const [searchQuery, setSearchQuery] = useState(savedImport?.search ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(savedImport?.search ?? "");
  const [pageRows, setPageRows] = useState<string[][]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [popupCell, setPopupCell] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapOverrides, setMapOverrides] = useState<Record<string, SuggestedColumnMap>>(
    savedImport?.mapOverrides ?? {}
  );
  const [showMapping, setShowMapping] = useState(false);
  const [showConflict, setShowConflict] = useState(false);
  const [sourceCounts, setSourceCounts] = useState<SourceCounts | null>(null);
  const restoredRef = useRef(false);
  const t = useT();

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const loadPreviews = useCallback(async (paths: string[], restore?: ImportDraft) => {
    setFilePaths(paths);
    const names = paths.map(
      (p) => p.split("/").pop() || p.split("\\").pop() || p
    );
    setFileName(
      paths.length === 1
        ? names[0]
        : `${paths.length} ${t("saisie.filesSelected")}`
    );
    const allSheets: SheetPreview[] = [];
    for (const path of paths) {
      const p = await api.previewExcel(path);
      const short = path.split("/").pop() || path.split("\\").pop() || path;
      for (const sheet of p.sheets) {
        allSheets.push({
          ...sheet,
          original_name: sheet.original_name || sheet.name,
          file_path: sheet.file_path || path,
          name: paths.length > 1 ? `${short} · ${sheet.name}` : sheet.name,
        });
      }
    }
    setPreview({ sheets: allSheets });
    const initial: Record<string, SuggestedColumnMap> = {};
    for (const sheet of allSheets) {
      initial[sheetKey(sheet)] = resolveSheetMap(sheet);
    }
    if (restore) {
      setActiveSheet(Math.min(restore.activeSheet, Math.max(0, allSheets.length - 1)));
      setImported(restore.imported);
      setPage(restore.page);
      setSearchQuery(restore.search);
      setDebouncedSearch(restore.search);
      setMapOverrides({ ...initial, ...restore.mapOverrides });
      setError(null);
    } else {
      setActiveSheet(0);
      setImported(false);
      setPage(0);
      setSearchQuery("");
      setDebouncedSearch("");
      setError(null);
      setMapOverrides(initial);
      if (allSheets.some(sheetNeedsMapping)) {
        setShowMapping(true);
      }
    }
  }, [t]);

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const draft = useUiDraftStore.getState().importDraft;
    if (!draft?.filePaths.length) return;
    void (async () => {
      try {
        await loadPreviews(draft.filePaths, draft);
      } catch {
        useUiDraftStore.getState().setImportDraft(null);
        setFilePaths([]);
        setFileName("");
        setPreview(null);
        setError(t("saisie.fileGone"));
      }
    })();
  }, [loadPreviews, t]);

  useEffect(() => {
    if (!preview || filePaths.length === 0) return;
    useUiDraftStore.getState().setImportDraft({
      filePaths,
      fileName,
      activeSheet,
      page,
      search: searchQuery,
      mapOverrides,
      imported,
    });
  }, [preview, filePaths, fileName, activeSheet, page, searchQuery, mapOverrides, imported]);

  const handleFilePick = async () => {
    const selected = await open({
      multiple: true,
      filters: [{ name: "Excel", extensions: ["xlsx"] }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    if (paths.length === 0) return;
    try {
      await loadPreviews(paths);
    } catch (e) {
      setError(String(e));
    }
  };

  const runImport = async (mode: ImportMode) => {
    if (filePaths.length === 0 || !currentSession || !preview) return;
    setImporting(true);
    setError(null);
    try {
      const maps = toImportMaps(preview.sheets, mapOverrides);
      await api.importExcelFiles(filePaths, currentSession.id, mode, maps);
      setImported(true);
      markCompareStale();
      onImportComplete();
    } catch (e) {
      setError(String(e));
    }
    setImporting(false);
  };

  const handleImport = async () => {
    if (!preview || !currentSession) return;
    if (preview.sheets.some((s) => !(mapOverrides[sheetKey(s)] ?? resolveSheetMap(s)).complete)) {
      setShowMapping(true);
      return;
    }
    try {
      const counts = await api.getSourceCounts(currentSession.id);
      if (counts.cnam_imported + counts.olivex_imported > 0) {
        setSourceCounts(counts);
        setShowConflict(true);
        return;
      }
    } catch (e) {
      setError(String(e));
      return;
    }
    await runImport("replace");
  };

  const activeSheetData = preview?.sheets[activeSheet];
  const displayHeaders = useMemo(() => {
    if (!activeSheetData) return [];
    return filterColumns(activeSheetData.headers, [], activeSheetData.detected_type).headers;
  }, [activeSheetData]);

  useEffect(() => {
    if (!activeSheetData) {
      setPageRows([]);
      setFilteredTotal(0);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await api.previewExcelPage(
          activeSheetData.file_path,
          activeSheetData.original_name || activeSheetData.name,
          page * ROWS_PER_PAGE,
          ROWS_PER_PAGE,
          debouncedSearch.trim() || null
        );
        if (cancelled) return;
        const filtered = filterColumns(
          activeSheetData.headers,
          result.rows,
          activeSheetData.detected_type
        );
        setPageRows(filtered.rows);
        setFilteredTotal(result.total);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSheetData, page, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const clearPreview = () => {
    setPreview(null);
    setFilePaths([]);
    setFileName("");
    setSearchQuery("");
    setDebouncedSearch("");
    setError(null);
    setMapOverrides({});
    setImported(false);
    setPageRows([]);
    useUiDraftStore.getState().setImportDraft(null);
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden min-h-0">
      <AnimatePresence>
        {popupCell !== null && (
          <CellPopup value={popupCell} onClose={() => setPopupCell(null)} />
        )}
      </AnimatePresence>

      {showMapping && preview && (
        <ColumnMappingModal
          sheets={preview.sheets}
          initial={mapOverrides}
          onCancel={() => setShowMapping(false)}
          onConfirm={(maps) => {
            setMapOverrides(maps);
            setShowMapping(false);
          }}
        />
      )}

      {showConflict && sourceCounts && preview && (
        <ImportConflictModal
          existing={sourceCounts}
          incoming={incomingPreviewCounts(preview.sheets)}
          onCancel={() => setShowConflict(false)}
          onReplace={() => {
            setShowConflict(false);
            runImport("replace");
          }}
          onMerge={() => {
            setShowConflict(false);
            runImport("merge");
          }}
        />
      )}

      {error && (
        <div className="rounded-xl bg-[var(--red-bg)] border border-[var(--red)]/30 px-4 py-3 text-[14px] font-semibold text-[var(--red)]">
          {error.includes(t("saisie.fileGone")) ? error : `${t("saisie.importError")}: ${error}`}
        </div>
      )}

      {!preview && (
        <div
          className={`flex-1 flex flex-col items-center justify-center gap-4 border-2 border-dashed rounded-2xl transition-colors cursor-pointer ${
            dragOver
              ? "border-[var(--teal)] bg-[var(--teal-light)]"
              : "border-[var(--teal)]/40 hover:border-[var(--teal)] bg-[var(--bg-card)]"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFilePick();
          }}
          onClick={handleFilePick}
        >
          <div className="w-20 h-20 rounded-2xl bg-[var(--teal-light)] flex items-center justify-center">
            <FileIcon size={36} color="var(--teal)" />
          </div>
          <p className="text-[18px] font-bold text-[var(--text-primary)]">
            {t("saisie.dropTitle")}
          </p>
          <p className="text-[15px] text-[var(--text-secondary)]">
            {t("saisie.dropSub")}
          </p>
          <button className={`mt-3 ${softControlBase} ${softToggleActive}`}>
            {t("saisie.browse")}
          </button>
        </div>
      )}

      {preview && activeSheetData && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-full bg-[var(--green-bg)] text-[var(--green)] flex items-center justify-center text-[16px] font-bold shrink-0">✓</span>
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-[var(--text-primary)] truncate">{fileName}</p>
                <p className="text-[13px] text-[var(--text-secondary)] truncate">
                  {preview.sheets.length} {t("saisie.sheetsDetected")} : {preview.sheets.map((s) => s.name).join(" · ")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <SoftActionButton
                onClick={() => setShowMapping(true)}
                label={t("saisie.adjustCols")}
                variant="muted"
              />
              <SoftActionButton
                onClick={clearPreview}
                label={t("saisie.cancel")}
                variant="muted"
              />
              <SoftActionButton
                onClick={handleImport}
                disabled={importing || imported}
                label={imported ? t("saisie.imported") : importing ? t("saisie.importing") : t("saisie.import")}
                variant="primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {preview.sheets.map((sheet, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setActiveSheet(i);
                    setPage(0);
                  }}
                  className={`${softControlBase} h-10 ${
                    activeSheet === i ? softToggleActive : softToggleIdle
                  }`}
                >
                  {sheet.detected_type.toUpperCase()} — {t("saisie.preview")}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <SearchField
                value={searchQuery}
                onChange={(q) => {
                  setSearchQuery(q);
                  setPage(0);
                }}
                placeholder={t("saisie.search")}
              />
              <p className="text-[13px] text-[var(--text-faint)] num-ltr whitespace-nowrap">
                {debouncedSearch.trim() ? filteredTotal : activeSheetData.row_count} {t("saisie.lines")} · {displayHeaders.length} {t("saisie.colsDetected")}
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm min-h-0">
            <table className="w-full text-[14px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[var(--bg-app)]">
                  {displayHeaders.map((h, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left font-semibold text-[var(--teal)] whitespace-nowrap border-b border-[var(--border)]"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, ri) => {
                  const globalIndex = safePage * ROWS_PER_PAGE + ri;
                  return (
                    <tr
                      key={globalIndex}
                      className={`transition-colors ${globalIndex % 2 === 0 ? "" : "bg-[var(--bg-app)]/40"}`}
                    >
                      {row.map((cell, ci) => {
                        const isLong = cell.length > 45;
                        return (
                          <td
                            key={ci}
                            className={`px-4 py-2 border-b border-[var(--border)]/30 whitespace-nowrap ${
                              isLong
                                ? "max-w-[350px] truncate cursor-pointer hover:text-[var(--teal)]"
                                : ""
                            }`}
                            onClick={isLong ? () => setPopupCell(cell) : undefined}
                            title={isLong ? "Cliquer pour voir le contenu complet" : undefined}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
            <TablePagination
              page={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ManuelMode({ refreshKey }: { refreshKey: number }) {
  const { currentSession } = useSessionStore();
  const markCompareStale = useDataStore((s) => s.markCompareStale);
  const t = useT();
  const savedManuel = useUiDraftStore.getState().manuelDraft;
  const [activeSource, setActiveSource] = useState<"cnam" | "olivex">(savedManuel.source);
  const [counts, setCounts] = useState<EntryCounts>({ olivex_count: 0, cnam_count: 0 });
  const [olivexEntries, setOlivexEntries] = useState<OlivexEntry[]>([]);
  const [cnamEntries, setCnamEntries] = useState<CnamEntry[]>([]);
  const [filteredTotal, setFilteredTotal] = useState(0);
  const [showAddForm, setShowAddForm] = useState(savedManuel.showAddForm);
  const [editingRowId, setEditingRowId] = useState<number | null>(savedManuel.editingRowId);
  const [addForm, setAddForm] = useState<Record<string, string> | null>(savedManuel.addForm);
  const [editForm, setEditForm] = useState<Record<string, string> | null>(savedManuel.editForm);
  const [page, setPage] = useState(savedManuel.page);
  const [searchQuery, setSearchQuery] = useState(savedManuel.search);
  const [popupCell, setPopupCell] = useState<string | null>(null);
  const skipSourceReset = useRef(true);

  const loadPage = useCallback(async () => {
    if (!currentSession) return;
    const c = await api.getEntryCounts(currentSession.id);
    setCounts(c);
    const offset = page * ROWS_PER_PAGE;
    const search = searchQuery.trim() || null;
    if (activeSource === "cnam") {
      const result = await api.getCnamEntries(currentSession.id, offset, ROWS_PER_PAGE, search);
      setCnamEntries(result.entries);
      setFilteredTotal(result.total);
    } else {
      const result = await api.getOlivexEntries(currentSession.id, offset, ROWS_PER_PAGE, search);
      setOlivexEntries(result.entries);
      setFilteredTotal(result.total);
    }
  }, [currentSession, activeSource, page, searchQuery]);

  useEffect(() => {
    void loadPage();
  }, [loadPage, refreshKey]);

  useEffect(() => {
    if (skipSourceReset.current) {
      skipSourceReset.current = false;
      return;
    }
    setPage(0);
    setShowAddForm(false);
    setEditingRowId(null);
    setSearchQuery("");
    setAddForm(null);
    setEditForm(null);
  }, [activeSource]);

  useEffect(() => {
    useUiDraftStore.getState().setManuelDraft({
      source: activeSource,
      page,
      search: searchQuery,
      showAddForm,
      addForm,
      editingRowId,
      editForm,
    });
  }, [activeSource, page, searchQuery, showAddForm, addForm, editingRowId, editForm]);

  const handleDeleteEntry = async (id: number) => {
    await api.deleteEntry(activeSource, id);
    markCompareStale();
    void loadPage();
  };

  const handleAddEntry = async (formData: Record<string, string>) => {
    if (!currentSession) return;
    if (!canCreateEntry(formData, activeSource)) return;
    if (activeSource === "cnam") {
      const entry: CnamEntry = {
        session_id: currentSession.id,
        num: formData.num || null,
        code_fs: formData.code_fs || null,
        type_auth: formData.type_auth || null,
        nni: formData.nni?.trim() || "",
        code: formData.code || null,
        prestation: formData.prestation || null,
        quantite: parseInt(formData.quantite, 10) || 1,
        montant: parseFloat(formData.montant) || 0,
        user_bio: formData.user_bio || null,
        date_op: formData.date_op || null,
      };
      await api.addCnamEntry(entry);
    } else {
      const entry: OlivexEntry = {
        session_id: currentSession.id,
        ref_code: formData.ref_code || null,
        organisme: formData.organisme || null,
        date: formData.date || null,
        nni: formData.nni?.trim() || "",
        num_feuille: formData.num_feuille || null,
        nature: formData.nature || null,
        montant: parseFloat(formData.montant) || 0,
      };
      await api.addOlivexEntry(entry);
    }
    setShowAddForm(false);
    setAddForm(null);
    setSearchQuery("");
    markCompareStale();
    const c = await api.getEntryCounts(currentSession.id);
    setCounts(c);
    const total = activeSource === "cnam" ? c.cnam_count : c.olivex_count;
    setPage(Math.max(0, Math.ceil(total / ROWS_PER_PAGE) - 1));
  };

  const handleUpdateEntry = async (
    id: number,
    formData: Record<string, string>
  ) => {
    if (!currentSession) return;
    if (activeSource === "cnam") {
      const entry: CnamEntry = {
        id,
        session_id: currentSession.id,
        num: formData.num || null,
        code_fs: formData.code_fs || null,
        type_auth: formData.type_auth || null,
        nni: formData.nni,
        code: formData.code || null,
        prestation: formData.prestation || null,
        quantite: parseInt(formData.quantite, 10) || 1,
        montant: parseFloat(formData.montant) || 0,
        user_bio: formData.user_bio || null,
        date_op: formData.date_op || null,
      };
      await api.updateCnamEntry(entry);
    } else {
      const entry: OlivexEntry = {
        id,
        session_id: currentSession.id,
        ref_code: formData.ref_code || null,
        organisme: formData.organisme || null,
        date: formData.date || null,
        nni: formData.nni,
        num_feuille: formData.num_feuille || null,
        nature: formData.nature || null,
        montant: parseFloat(formData.montant) || 0,
      };
      await api.updateOlivexEntry(entry);
    }
    setEditingRowId(null);
    setEditForm(null);
    markCompareStale();
    void loadPage();
  };

  const cols = activeSource === "cnam" ? CNAM_COLS : OLIVEX_COLS;
  const fields = activeSource === "cnam" ? CNAM_FIELDS : OLIVEX_FIELDS;
  const rows = activeSource === "cnam" ? cnamEntries : olivexEntries;

  const totalPages = Math.max(1, Math.ceil(filteredTotal / ROWS_PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const isLastPage = safePage >= totalPages - 1;

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const startAddRow = () => {
    if (showAddForm) {
      setShowAddForm(false);
      setAddForm(null);
      return;
    }
    setSearchQuery("");
    setEditingRowId(null);
    setEditForm(null);
    setShowAddForm(true);
    const total = activeSource === "cnam" ? counts.cnam_count : counts.olivex_count;
    setPage(Math.max(0, Math.ceil(total / ROWS_PER_PAGE) - 1));
  };

  const getFieldValue = (
    row: CnamEntry | OlivexEntry,
    field: string
  ): string => {
    const val = (row as unknown as Record<string, unknown>)[field];
    if (val === null || val === undefined) return "";
    return String(val);
  };

  return (
    <div className="flex-1 flex flex-col gap-4 overflow-hidden relative min-h-0">
      <AnimatePresence>
        {popupCell !== null && (
          <CellPopup value={popupCell} onClose={() => setPopupCell(null)} />
        )}
      </AnimatePresence>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => setActiveSource("cnam")}
          className={`${softControlBase} ${
            activeSource === "cnam" ? softToggleActive : softToggleIdle
          }`}
        >
          CNAM — <span className="num-ltr">{counts.cnam_count}</span> {t("saisie.lines")}
        </button>
        <button
          onClick={() => setActiveSource("olivex")}
          className={`${softControlBase} ${
            activeSource === "olivex" ? softToggleActive : softToggleIdle
          }`}
        >
          OLIVEX — <span className="num-ltr">{counts.olivex_count}</span> {t("saisie.lines")}
        </button>

        <SearchField
          value={searchQuery}
          onChange={(q) => {
            setSearchQuery(q);
            setPage(0);
          }}
          placeholder={t("saisie.search")}
        />

        <div className="flex-1" />
        <SoftActionButton
          onClick={startAddRow}
          label={t("saisie.addRow")}
          variant="primary"
        />
      </div>

      <div className="flex-1 overflow-hidden bg-[var(--bg-card)] rounded-2xl border border-[var(--border)] shadow-sm min-h-0">
        <div className="h-full overflow-auto">
          <table className="w-full text-[14px]">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--bg-app)]">
                {cols.map((col, i) => (
                  <th
                    key={i}
                    className={`px-4 py-3 text-left font-semibold text-[var(--text-secondary)] whitespace-nowrap border-b border-[var(--border)] ${
                      i === 0 ? "sticky left-0 bg-[var(--bg-app)] z-20" : ""
                    }`}
                  >
                    {col}
                  </th>
                ))}
                <th className="px-3 py-3 border-b border-[var(--border)] w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !showAddForm && (
                <tr>
                  <td
                    colSpan={cols.length + 1}
                    className="text-center py-16 text-[var(--text-faint)] text-[15px]"
                  >
                    {t("saisie.noData")}
                  </td>
                </tr>
              )}
              {rows.map((row, ri) => {
                const rowId = (row as { id?: number }).id!;
                const globalIndex = safePage * ROWS_PER_PAGE + ri;
                if (editingRowId === rowId) {
                  return (
                    <EditEntryRow
                      key={rowId}
                      fields={fields}
                      initialValues={
                        editForm ??
                        Object.fromEntries(fields.map((f) => [f, getFieldValue(row, f)]))
                      }
                      onSave={(data) => handleUpdateEntry(rowId, data)}
                      onCancel={() => {
                        setEditingRowId(null);
                        setEditForm(null);
                      }}
                      onChange={setEditForm}
                    />
                  );
                }
                return (
                  <tr
                    key={rowId}
                    onDoubleClick={() => {
                      setEditingRowId(rowId);
                      setEditForm(
                        Object.fromEntries(fields.map((f) => [f, getFieldValue(row, f)]))
                      );
                    }}
                    className={`hover:bg-[var(--teal-light)]/30 transition-colors cursor-pointer group ${
                      globalIndex % 2 !== 0 ? "bg-[var(--bg-app)]/40" : ""
                    }`}
                  >
                    {fields.map((field, ci) => {
                      const val = getFieldValue(row, field);
                      const isLong = val.length > 40;
                      return (
                        <td
                          key={ci}
                          className={`px-4 py-2 border-b border-[var(--border)]/30 ${
                            ci === 0 ? "sticky left-0 bg-inherit z-10" : ""
                          } ${isLong ? "max-w-[280px] truncate cursor-pointer hover:text-[var(--teal)]" : "whitespace-nowrap"}`}
                          title={isLong ? "Cliquer pour voir" : undefined}
                          onClick={isLong ? () => setPopupCell(val) : undefined}
                        >
                          {val}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-b border-[var(--border)]/30">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteEntry(rowId);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[var(--red)] hover:text-[var(--red-dark)] text-[16px] font-bold transition-opacity"
                        title={t("saisie.delete")}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
              {showAddForm && isLastPage && (
                <AddEntryRow
                  fields={fields}
                  source={activeSource}
                  initialValues={addForm ?? undefined}
                  onSave={handleAddEntry}
                  onCancel={() => {
                    setShowAddForm(false);
                    setAddForm(null);
                  }}
                  onChange={setAddForm}
                />
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-4 flex-wrap">
          <p className="text-[13px] text-[var(--text-faint)] num-ltr">
            OLIVEX : {counts.olivex_count} · CNAM : {counts.cnam_count}
          </p>
          <TablePagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
        <SoftActionButton
          onClick={() => useSessionStore.getState().setActiveTab("rapport")}
          label={t("saisie.goToRapport")}
          variant="primary"
        />
      </div>
    </div>
  );
}

function AddEntryRow({
  fields,
  source,
  initialValues,
  onSave,
  onCancel,
  onChange,
}: {
  fields: string[];
  source: "cnam" | "olivex";
  initialValues?: Record<string, string>;
  onSave: (data: Record<string, string>) => void;
  onCancel: () => void;
  onChange?: (data: Record<string, string>) => void;
}) {
  const t = useT();
  const [formData, setFormData] = useState<Record<string, string>>(
    () => initialValues ?? Object.fromEntries(fields.map((f) => [f, ""]))
  );
  const [error, setError] = useState(false);

  const keyFields = new Set(
    source === "cnam" ? ["nni", "montant", "code_fs"] : ["nni", "montant", "num_feuille"]
  );

  const trySave = () => {
    if (!canCreateEntry(formData, source)) {
      setError(true);
      return;
    }
    setError(false);
    onSave(formData);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") trySave();
    else if (e.key === "Escape") onCancel();
  };

  return (
    <>
      <tr className="bg-[var(--teal-light)]">
        {fields.map((field) => (
          <td key={field} className="px-2 py-2 border-b border-[var(--border)]">
            <input
              type={field === "montant" || field === "quantite" ? "number" : "text"}
              placeholder={field}
              value={formData[field] ?? ""}
              onChange={(e) => {
                setError(false);
                const next = { ...formData, [field]: e.target.value };
                setFormData(next);
                onChange?.(next);
              }}
              onKeyDown={handleKeyDown}
              className={`w-full px-3 py-2 text-[13px] rounded-lg border bg-[var(--bg-card)] outline-none focus:border-[var(--teal)] transition-colors ${
                keyFields.has(field) ? "border-[var(--teal)]" : "border-[var(--border)]"
              }`}
              autoFocus={field === fields[0]}
            />
          </td>
        ))}
        <td className="px-3 py-2 border-b border-[var(--border)]">
          <div className="flex gap-1.5">
            <button
              onClick={trySave}
              className="w-8 h-8 rounded-lg bg-[var(--green-bg)] text-[var(--green)] font-bold text-[14px] flex items-center justify-center hover:bg-[var(--green)] hover:text-white transition-colors"
            >
              ✓
            </button>
            <button
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-[var(--red-bg)] text-[var(--red)] font-bold text-[14px] flex items-center justify-center hover:bg-[var(--red)] hover:text-white transition-colors"
            >
              ×
            </button>
          </div>
        </td>
      </tr>
      <tr className="bg-[var(--teal-light)]">
        <td colSpan={fields.length + 1} className="px-4 pb-3 pt-0">
          <p className={`text-[12px] ${error ? "text-[var(--red)] font-semibold" : "text-[var(--text-secondary)]"}`}>
            {error ? t("saisie.addIncomplete") : t("saisie.addHint")}
          </p>
        </td>
      </tr>
    </>
  );
}

function EditEntryRow({
  fields,
  initialValues,
  onSave,
  onCancel,
  onChange,
}: {
  fields: string[];
  initialValues: Record<string, string>;
  onSave: (data: Record<string, string>) => void;
  onCancel: () => void;
  onChange?: (data: Record<string, string>) => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>(initialValues);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") onSave(formData);
    else if (e.key === "Escape") onCancel();
  };

  return (
    <tr className="bg-[var(--amber-bg)]">
      {fields.map((field) => (
        <td key={field} className="px-2 py-2 border-b border-[var(--border)]">
          <input
            type={field === "montant" || field === "quantite" ? "number" : "text"}
            value={formData[field] ?? ""}
            onChange={(e) => {
              const next = { ...formData, [field]: e.target.value };
              setFormData(next);
              onChange?.(next);
            }}
            onKeyDown={handleKeyDown}
            className="w-full px-3 py-2 text-[13px] rounded-lg border border-[var(--border)] bg-[var(--bg-card)] outline-none focus:border-[var(--teal)] transition-colors"
          />
        </td>
      ))}
      <td className="px-3 py-2 border-b border-[var(--border)]">
        <div className="flex gap-1.5">
          <button
            onClick={() => onSave(formData)}
            className="w-8 h-8 rounded-lg bg-[var(--green-bg)] text-[var(--green)] font-bold text-[14px] flex items-center justify-center hover:bg-[var(--green)] hover:text-white transition-colors"
          >
            ✓
          </button>
          <button
            onClick={onCancel}
            className="w-8 h-8 rounded-lg bg-[var(--red-bg)] text-[var(--red)] font-bold text-[14px] flex items-center justify-center hover:bg-[var(--red)] hover:text-white transition-colors"
          >
            ×
          </button>
        </div>
      </td>
    </tr>
  );
}
