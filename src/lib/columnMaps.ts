import type { SheetColumnMap, SheetPreview, SuggestedColumnMap } from "@/types";

const STORAGE_KEY = "tawthiq.columnMaps.v1";

export type SourceKind = "cnam" | "olivex";

interface RememberedMap {
  nniHeader: string;
  ficheHeader: string;
  montantHeader: string;
}

type StoredMaps = Partial<Record<SourceKind, RememberedMap>>;

function loadStored(): StoredMaps {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredMaps) : {};
  } catch {
    return {};
  }
}

export function rememberColumnMap(source: SourceKind, headers: string[], map: { nni: number; fiche: number; montant: number }) {
  const stored = loadStored();
  stored[source] = {
    nniHeader: headers[map.nni] ?? "",
    ficheHeader: headers[map.fiche] ?? "",
    montantHeader: headers[map.montant] ?? "",
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

function normalize(h: string): string {
  return h.toLowerCase().replace(/[°._-]/g, " ").split(/\s+/).join(" ");
}

function indexOfHeader(headers: string[], name: string): number | null {
  const target = normalize(name);
  const exact = headers.findIndex((h) => normalize(h) === target);
  if (exact >= 0) return exact;
  const partial = headers.findIndex((h) => {
    const n = normalize(h);
    return n.includes(target) || target.includes(n);
  });
  return partial >= 0 ? partial : null;
}

export function applyRememberedMap(headers: string[], source: SourceKind): SuggestedColumnMap | null {
  const remembered = loadStored()[source];
  if (!remembered) return null;
  const nni = indexOfHeader(headers, remembered.nniHeader);
  const fiche = indexOfHeader(headers, remembered.ficheHeader);
  const montant = indexOfHeader(headers, remembered.montantHeader);
  if (nni === null || fiche === null || montant === null) return null;
  return { source, nni, fiche, montant, complete: true };
}

export function resolveSheetMap(sheet: SheetPreview): SuggestedColumnMap {
  const hint = (sheet.suggested_map?.source || sheet.detected_type || "unknown") as string;
  const source: SourceKind | "unknown" = hint === "cnam" || hint === "olivex" ? hint : "unknown";
  if (sheet.suggested_map?.complete) return sheet.suggested_map;
  if (source !== "unknown") {
    const remembered = applyRememberedMap(sheet.headers, source);
    if (remembered) return remembered;
  }
  return sheet.suggested_map ?? {
    source: hint,
    nni: null,
    fiche: null,
    montant: null,
    complete: false,
  };
}

export function sheetNeedsMapping(sheet: SheetPreview): boolean {
  return !resolveSheetMap(sheet).complete;
}

export function toImportMaps(
  sheets: SheetPreview[],
  overrides?: Record<string, SuggestedColumnMap>,
): SheetColumnMap[] {
  return sheets.flatMap((sheet) => {
    const key = sheetKey(sheet);
    const resolved = overrides?.[key] ?? resolveSheetMap(sheet);
    if (!resolved.complete || (resolved.source !== "cnam" && resolved.source !== "olivex")) {
      return [];
    }
    if (resolved.nni === null || resolved.fiche === null || resolved.montant === null) return [];
    rememberColumnMap(resolved.source, sheet.headers, {
      nni: resolved.nni,
      fiche: resolved.fiche,
      montant: resolved.montant,
    });
    return [{
      filePath: sheet.file_path,
      sheetName: sheet.original_name || sheet.name,
      source: resolved.source,
      nni: resolved.nni,
      fiche: resolved.fiche,
      montant: resolved.montant,
    }];
  });
}

export function sheetKey(sheet: SheetPreview): string {
  return `${sheet.file_path}::${sheet.original_name || sheet.name}`;
}

export function incomingPreviewCounts(sheets: SheetPreview[]): { cnam: number; olivex: number } {
  return sheets.reduce(
    (acc, sheet) => {
      const source = resolveSheetMap(sheet).source;
      if (source === "cnam") acc.cnam += sheet.row_count;
      if (source === "olivex") acc.olivex += sheet.row_count;
      return acc;
    },
    { cnam: 0, olivex: 0 },
  );
}
