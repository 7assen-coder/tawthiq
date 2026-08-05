import { invoke } from "@tauri-apps/api/core";
import type {
  Session,
  SessionWithSummary,
  ImportPreview,
  ImportResult,
  ImportMode,
  SheetColumnMap,
  PreviewPage,
  OlivexEntry,
  CnamEntry,
  OlivexPage,
  CnamPage,
  EntryCounts,
  SourceCounts,
  CompareResult,
  ComparisonResult,
} from "@/types";

export interface PinVerifyResult {
  ok: boolean;
  retry_after_secs: number | null;
  error: string | null;
}

export interface ComparisonPage {
  entries: ComparisonResult[];
  total: number;
  total_difference: number;
}

// Auth
export const hasPin = () => invoke<boolean>("has_pin");
export const setupPin = (pin: string) => invoke<void>("setup_pin", { pin });
export const verifyPin = (pin: string) => invoke<PinVerifyResult>("verify_pin", { pin });
export const changePin = (oldPin: string, newPin: string) =>
  invoke<void>("change_pin", { oldPin, newPin });
export const lockSession = () => invoke<void>("lock_session");
export const getAppVersion = () => invoke<string>("get_app_version");

export interface AccessStatus {
  install_id: string;
  revoked: boolean;
  message_fr: string;
  message_ar: string;
}

export const checkAccess = () => invoke<AccessStatus>("check_access");
export const getInstallId = () => invoke<string>("get_install_id");

// Session
export const getCurrentSession = () => invoke<Session>("get_current_session");
export const checkAndArchivePrevious = () =>
  invoke<string | null>("check_and_archive_previous");
export const getAllSessions = () =>
  invoke<SessionWithSummary[]>("get_all_sessions");
export const archiveSession = (sessionId: number) =>
  invoke<void>("archive_session", { sessionId });

// Import
export const previewExcel = (filePath: string) =>
  invoke<ImportPreview>("preview_excel", { filePath });
export const previewExcelPage = (
  filePath: string,
  sheetName: string,
  offset: number,
  limit: number,
  search?: string | null
) =>
  invoke<PreviewPage>("preview_excel_page", {
    filePath,
    sheetName,
    offset,
    limit,
    search: search ?? null,
  });
export const importExcel = (filePath: string, sessionId: number) =>
  invoke<ImportResult>("import_excel", { filePath, sessionId });
export const importExcelFiles = (
  filePaths: string[],
  sessionId: number,
  mode: ImportMode = "replace",
  maps?: SheetColumnMap[],
) =>
  invoke<ImportResult>("import_excel_files", {
    filePaths,
    sessionId,
    mode,
    maps: maps ?? null,
  });

// Entries
export const getEntryCounts = (sessionId: number) =>
  invoke<EntryCounts>("get_entry_counts", { sessionId });
export const getSourceCounts = (sessionId: number) =>
  invoke<SourceCounts>("get_source_counts", { sessionId });
export const getOlivexEntries = (
  sessionId: number,
  offset: number,
  limit: number,
  search?: string | null
) =>
  invoke<OlivexPage>("get_olivex_entries", {
    sessionId,
    offset,
    limit,
    search: search ?? null,
  });
export const getCnamEntries = (
  sessionId: number,
  offset: number,
  limit: number,
  search?: string | null
) =>
  invoke<CnamPage>("get_cnam_entries", {
    sessionId,
    offset,
    limit,
    search: search ?? null,
  });
export const addOlivexEntry = (entry: OlivexEntry) =>
  invoke<number>("add_olivex_entry", { entry });
export const addCnamEntry = (entry: CnamEntry) =>
  invoke<number>("add_cnam_entry", { entry });
export const updateOlivexEntry = (entry: OlivexEntry) =>
  invoke<void>("update_olivex_entry", { entry });
export const updateCnamEntry = (entry: CnamEntry) =>
  invoke<void>("update_cnam_entry", { entry });
export const deleteEntry = (entryType: string, entryId: number) =>
  invoke<void>("delete_entry", { entryType, entryId });

// Compare
export const runComparison = (sessionId: number) =>
  invoke<CompareResult>("run_comparison", { sessionId });
export const getLatestCompareResult = (sessionId: number) =>
  invoke<CompareResult | null>("get_latest_compare_result", { sessionId });
export const getComparisonResults = (
  sessionId: number,
  casFilter?: string,
  offset = 0,
  limit = 30,
  search?: string | null
) =>
  invoke<ComparisonPage>("get_comparison_results", {
    sessionId,
    casFilter: casFilter ?? null,
    offset,
    limit,
    search: search ?? null,
  });
export const updateResolution = (
  resultId: number,
  status: string,
  note?: string
) => invoke<void>("update_resolution", { resultId, status, note: note ?? null });

// Export
export const exportCaseToExcel = (
  sessionId: number,
  cas: string,
  outputPath: string
) => invoke<string>("export_case_to_excel", { sessionId, cas, outputPath });
export const exportFullReport = (sessionId: number, outputPath: string) =>
  invoke<string>("export_full_report", { sessionId, outputPath });

// Backup
export const backupDatabase = (outputPath: string) =>
  invoke<string>("backup_database", { outputPath });
export const restoreDatabase = (inputPath: string) =>
  invoke<void>("restore_database", { inputPath });
export const getDbLocation = () => invoke<string>("get_db_location");
export const autoBackup = () => invoke<string>("auto_backup");
