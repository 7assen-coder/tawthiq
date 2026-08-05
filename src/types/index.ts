export interface Session {
  id: number;
  month: string;
  status: string;
  archived_at: string | null;
  created_at: string;
}

export interface SessionWithSummary {
  session: Session;
  total_manque: number;
  total_surplus: number;
  conformity_rate: number;
  cas_counts: CasCounts;
}

export interface CasCounts {
  cas1: number;
  cas2: number;
  cas3: number;
  cas4: number;
  cas5: number;
  cas6: number;
  cas7: number;
  /** @deprecated Retired — always 0 in new engine; kept for old DB rows */
  cas8?: number;
}

export interface OlivexEntry {
  id?: number;
  session_id: number;
  ref_code: string | null;
  organisme: string | null;
  date: string | null;
  nni: string;
  num_feuille: string | null;
  nature: string | null;
  montant: number;
}

export interface CnamEntry {
  id?: number;
  session_id: number;
  num: string | null;
  code_fs: string | null;
  type_auth: string | null;
  nni: string;
  code: string | null;
  prestation: string | null;
  quantite: number;
  montant: number;
  user_bio: string | null;
  date_op: string | null;
}

export interface EntryCounts {
  olivex_count: number;
  cnam_count: number;
}

export interface SourceCounts {
  olivex_imported: number;
  olivex_manual: number;
  cnam_imported: number;
  cnam_manual: number;
}

export interface SuggestedColumnMap {
  source: string;
  nni: number | null;
  fiche: number | null;
  montant: number | null;
  complete: boolean;
}

export interface SheetPreview {
  name: string;
  original_name: string;
  file_path: string;
  row_count: number;
  col_count: number;
  headers: string[];
  detected_type: string;
  suggested_map: SuggestedColumnMap;
}

export interface PreviewPage {
  rows: string[][];
  total: number;
}

export interface OlivexPage {
  entries: OlivexEntry[];
  total: number;
}

export interface CnamPage {
  entries: CnamEntry[];
  total: number;
}

export interface SheetColumnMap {
  filePath: string;
  sheetName: string;
  source: "cnam" | "olivex";
  nni: number;
  fiche: number;
  montant: number;
  extras?: Record<string, number>;
}

export interface ImportPreview {
  sheets: SheetPreview[];
}

export interface ImportResult {
  olivex_count: number;
  cnam_count: number;
  inserted: number;
  skipped_dupes: number;
}

export type ImportMode = "replace" | "merge";

export interface ComparisonResult {
  id?: number;
  cas: string;
  nni: string;
  fiche_olivex: string | null;
  fiche_cnam: string | null;
  montant_olivex: number;
  montant_cnam: number;
  difference: number;
  nature: string | null;
  resolution_status?: string;
  notes?: string;
}

export interface CompareResult {
  total_manque: number;
  total_surplus: number;
  conformity_rate: number;
  cas_counts: CasCounts;
  results: ComparisonResult[];
}

export type CasType =
  | "cas1"
  | "cas2"
  | "cas3"
  | "cas4"
  | "cas5"
  | "cas6"
  | "cas7";

export interface CasConfig {
  type: CasType;
  label: string;
  sublabel: string;
  color: string;
  bgColor: string;
  icon: string;
}

export const CAS_CONFIGS: CasConfig[] = [
  { type: "cas1", label: "cas.cas1", sublabel: "cas.cas1.sub", color: "#1E9E6B", bgColor: "#E7F7EF", icon: "check" },
  { type: "cas2", label: "cas.cas2", sublabel: "cas.cas2.sub", color: "#1E9E6B", bgColor: "#E7F7EF", icon: "check" },
  { type: "cas3", label: "cas.cas3", sublabel: "cas.cas3.sub", color: "#E0533D", bgColor: "#FDEBE8", icon: "alert" },
  { type: "cas4", label: "cas.cas4", sublabel: "cas.cas4.sub", color: "#B01E28", bgColor: "#FBE4E5", icon: "alert" },
  { type: "cas5", label: "cas.cas5", sublabel: "cas.cas5.sub", color: "#D89A1D", bgColor: "#FCF3DC", icon: "flag" },
  { type: "cas6", label: "cas.cas6", sublabel: "cas.cas6.sub", color: "#4C5FD5", bgColor: "#ECEEFC", icon: "x-circle" },
  { type: "cas7", label: "cas.cas7", sublabel: "cas.cas7.sub", color: "#1E9E6B", bgColor: "#E7F7EF", icon: "check" },
];

export type TabId = "saisie" | "rapport" | "historique" | "reglages";
export type SaisieMode = "import" | "manuel";
export type ReglagesCategory = "apparence" | "donnees" | "apropos";
