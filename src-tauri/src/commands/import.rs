use crate::db::DbState;
use crate::guard;
use calamine::{open_workbook, Data, Reader, Xlsx};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct SuggestedColumnMap {
    pub source: String,
    pub nni: Option<usize>,
    pub fiche: Option<usize>,
    pub montant: Option<usize>,
    pub complete: bool,
}

#[derive(Debug, Serialize)]
pub struct SheetPreview {
    pub name: String,
    pub original_name: String,
    pub file_path: String,
    pub row_count: usize,
    pub col_count: usize,
    pub headers: Vec<String>,
    pub detected_type: String,
    pub suggested_map: SuggestedColumnMap,
}

#[derive(Debug, Serialize)]
pub struct PreviewPage {
    pub rows: Vec<Vec<String>>,
    pub total: usize,
}

#[derive(Debug, Serialize)]
pub struct ImportPreview {
    pub sheets: Vec<SheetPreview>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub olivex_count: usize,
    pub cnam_count: usize,
    pub inserted: usize,
    pub skipped_dupes: usize,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SheetColumnMap {
    pub file_path: String,
    pub sheet_name: String,
    pub source: String,
    pub nni: usize,
    pub fiche: usize,
    pub montant: usize,
    pub extras: Option<HashMap<String, usize>>,
}

fn normalize_header(h: &str) -> String {
    h.to_lowercase()
        .replace('°', "")
        .replace('.', " ")
        .replace('_', " ")
        .replace('-', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn find_col(headers: &[String], aliases: &[&str]) -> Option<usize> {
    let norms: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();
    for alias in aliases {
        let a = normalize_header(alias);
        if let Some(i) = norms.iter().position(|h| h == &a) {
            return Some(i);
        }
    }
    for alias in aliases {
        let a = normalize_header(alias);
        if a.len() < 2 {
            continue;
        }
        if let Some(i) = norms.iter().position(|h| {
            if a == "code" && h.contains("fs") {
                return false;
            }
            h.contains(&a)
        }) {
            return Some(i);
        }
    }
    None
}

fn detect_sheet_type(headers: &[String]) -> String {
    let lower: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();
    if lower.iter().any(|h| {
        h.contains("n pc") || h.contains("n feuille") || h.contains("mnt") || h.contains("organisme")
    }) {
        return "olivex".to_string();
    }
    if lower.iter().any(|h| h.contains("inam") || h.contains("code fs") || h.contains("prestation"))
    {
        return "cnam".to_string();
    }
    "unknown".to_string()
}

fn suggest_map(headers: &[String], source_hint: &str) -> SuggestedColumnMap {
    let source = if source_hint == "unknown" {
        detect_sheet_type(headers)
    } else {
        source_hint.to_string()
    };

    let (nni, fiche, montant) = if source == "olivex" {
        (
            find_col(headers, &["n pc", "n° pc", "nni", "inam", "num pc", "no pc"]),
            find_col(
                headers,
                &["n feuille", "n° feuille", "num feuille", "fiche", "n fs", "num fs"],
            ),
            find_col(
                headers,
                &["mnt total", "mnt. total", "montant total", "montant", "mnt"],
            ),
        )
    } else if source == "cnam" {
        (
            find_col(headers, &["inam", "nni", "n inam", "n° inam"]),
            find_col(
                headers,
                &["code fs", "code_fs", "n fiche", "n° fiche", "fiche", "num fiche"],
            ),
            find_col(
                headers,
                &["montant facture", "mnt facture", "montant", "mnt"],
            ),
        )
    } else {
        (None, None, None)
    };

    SuggestedColumnMap {
        complete: nni.is_some() && fiche.is_some() && montant.is_some() && source != "unknown",
        source,
        nni,
        fiche,
        montant,
    }
}

fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Int(i) => i.to_string(),
        Data::Float(f) => {
            if *f == (*f as i64) as f64 {
                (*f as i64).to_string()
            } else {
                f.to_string()
            }
        }
        Data::String(s) => s.clone(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(dt) => dt.to_string(),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("{:?}", e),
        Data::Empty => String::new(),
    }
}

fn row_to_strings(row: &[Data]) -> Vec<String> {
    row.iter().map(cell_to_string).collect()
}

fn data_cell(row: &[Data], idx: Option<usize>) -> String {
    idx.and_then(|i| row.get(i))
        .map(cell_to_string)
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn parse_montant(raw: &str) -> f64 {
    raw.replace(' ', "").replace(',', ".").parse().unwrap_or(0.0)
}

fn parse_qty(raw: &str) -> i64 {
    raw.replace(' ', "").replace(',', ".").parse::<f64>().unwrap_or(1.0) as i64
}

fn clear_imported(conn: &Connection, session_id: i64) -> Result<(), String> {
    conn.execute(
        "DELETE FROM olivex_entries WHERE session_id = ?1 AND source = 'import'",
        [session_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "DELETE FROM cnam_entries WHERE session_id = ?1 AND source = 'import'",
        [session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn load_olivex_keys(conn: &Connection, session_id: i64) -> Result<std::collections::HashSet<(String, String, i64)>, String> {
    let mut stmt = conn
        .prepare("SELECT nni, COALESCE(num_feuille,''), montant FROM olivex_entries WHERE session_id = ?1")
        .map_err(|_| "DB_ERROR".to_string())?;
    let mut set = std::collections::HashSet::new();
    let rows = stmt
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                (row.get::<_, f64>(2)? * 100.0).round() as i64,
            ))
        })
        .map_err(|_| "DB_ERROR".to_string())?;
    for row in rows.flatten() {
        set.insert(row);
    }
    Ok(set)
}

fn load_cnam_keys(conn: &Connection, session_id: i64) -> Result<std::collections::HashSet<(String, String, i64)>, String> {
    let mut stmt = conn
        .prepare("SELECT nni, COALESCE(code_fs,''), montant FROM cnam_entries WHERE session_id = ?1")
        .map_err(|_| "DB_ERROR".to_string())?;
    let mut set = std::collections::HashSet::new();
    let rows = stmt
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                (row.get::<_, f64>(2)? * 100.0).round() as i64,
            ))
        })
        .map_err(|_| "DB_ERROR".to_string())?;
    for row in rows.flatten() {
        set.insert(row);
    }
    Ok(set)
}

fn resolve_map<'a>(
    headers: &[String],
    file_path: &str,
    sheet_name: &str,
    maps: &'a [SheetColumnMap],
) -> Option<(String, usize, usize, usize, Option<HashMap<String, usize>>)> {
    if let Some(m) = maps.iter().find(|m| {
        (m.file_path.is_empty() || m.file_path == file_path)
            && (m.sheet_name == sheet_name || m.sheet_name.is_empty())
    }) {
        return Some((
            m.source.clone(),
            m.nni,
            m.fiche,
            m.montant,
            m.extras.clone(),
        ));
    }

    let suggested = suggest_map(headers, "unknown");
    if suggested.complete {
        return Some((
            suggested.source,
            suggested.nni.unwrap(),
            suggested.fiche.unwrap(),
            suggested.montant.unwrap(),
            None,
        ));
    }
    None
}

fn extra_idx(extras: &Option<HashMap<String, usize>>, key: &str, headers: &[String], aliases: &[&str]) -> Option<usize> {
    if let Some(map) = extras {
        if let Some(i) = map.get(key) {
            return Some(*i);
        }
    }
    find_col(headers, aliases)
}

fn import_workbook_into(
    conn: &Connection,
    file_path: &str,
    session_id: i64,
    mode_merge: bool,
    maps: &[SheetColumnMap],
    olivex_count: &mut usize,
    cnam_count: &mut usize,
    inserted: &mut usize,
    skipped_dupes: &mut usize,
) -> Result<(), String> {
    let mut workbook: Xlsx<_> = open_workbook(file_path).map_err(|_| "BAD_FILE".to_string())?;
    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
    let mut olivex_keys = if mode_merge {
        load_olivex_keys(conn, session_id)?
    } else {
        std::collections::HashSet::new()
    };
    let mut cnam_keys = if mode_merge {
        load_cnam_keys(conn, session_id)?
    } else {
        std::collections::HashSet::new()
    };

    for name in &sheet_names {
        let Ok(range) = workbook.worksheet_range(name) else {
            continue;
        };
        let mut rows = range.rows();
        let Some(header_row) = rows.next() else {
            continue;
        };
        let headers = row_to_strings(header_row);
        let Some((source, nni_i, fiche_i, montant_i, extras)) =
            resolve_map(&headers, file_path, name, maps)
        else {
            continue;
        };

        conn.execute("BEGIN TRANSACTION", [])
            .or_else(|_| {
                let _ = conn.execute("ROLLBACK", []);
                conn.execute("BEGIN TRANSACTION", [])
            })
            .map_err(|_| "DB_ERROR".to_string())?;

        if source == "olivex" {
            let ref_i = extra_idx(&extras, "ref_code", &headers, &["ref", "ref.", "reference", "réf"]);
            let org_i = extra_idx(&extras, "organisme", &headers, &["organisme"]);
            let date_i = extra_idx(&extras, "date", &headers, &["date"]);
            let nat_i = extra_idx(&extras, "nature", &headers, &["nature"]);
            let mut stmt = conn
                .prepare("INSERT INTO olivex_entries (session_id, ref_code, organisme, date, nni, num_feuille, nature, montant, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'import')")
                .map_err(|_| "DB_ERROR".to_string())?;

            for row in rows {
                let nni = data_cell(row, Some(nni_i));
                let fiche = data_cell(row, Some(fiche_i));
                let montant = parse_montant(&data_cell(row, Some(montant_i)));
                if nni.is_empty() && fiche.is_empty() && montant == 0.0 {
                    continue;
                }
                let key = (nni.clone(), fiche.clone(), (montant * 100.0).round() as i64);
                if mode_merge && olivex_keys.contains(&key) {
                    *skipped_dupes += 1;
                    continue;
                }
                stmt.execute(rusqlite::params![
                    session_id,
                    data_cell(row, ref_i),
                    data_cell(row, org_i),
                    data_cell(row, date_i),
                    nni,
                    fiche,
                    data_cell(row, nat_i),
                    montant
                ])
                .map_err(|_| "DB_ERROR".to_string())?;
                olivex_keys.insert(key);
                *olivex_count += 1;
                *inserted += 1;
            }
        } else if source == "cnam" {
            let num_i = extra_idx(&extras, "num", &headers, &["n", "num", "numero", "n°"]);
            let type_i = extra_idx(&extras, "type_auth", &headers, &["type auth", "type_auth", "authentification"]);
            let code_i = extra_idx(&extras, "code", &headers, &["code"]);
            let prest_i = extra_idx(&extras, "prestation", &headers, &["prestation"]);
            let qty_i = extra_idx(&extras, "quantite", &headers, &["qt", "qte", "quantite", "quantité"]);
            let user_i = extra_idx(&extras, "user_bio", &headers, &["user bio", "user", "user_bio"]);
            let date_i = extra_idx(&extras, "date_op", &headers, &["date op", "date_op", "date"]);
            let mut stmt = conn
                .prepare("INSERT INTO cnam_entries (session_id, num, code_fs, type_auth, nni, code, prestation, quantite, montant, user_bio, date_op, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'import')")
                .map_err(|_| "DB_ERROR".to_string())?;

            for row in rows {
                let nni = data_cell(row, Some(nni_i));
                let fiche = data_cell(row, Some(fiche_i));
                let montant = parse_montant(&data_cell(row, Some(montant_i)));
                if nni.is_empty() && fiche.is_empty() && montant == 0.0 {
                    continue;
                }
                let key = (nni.clone(), fiche.clone(), (montant * 100.0).round() as i64);
                if mode_merge && cnam_keys.contains(&key) {
                    *skipped_dupes += 1;
                    continue;
                }
                let quantite = parse_qty(&data_cell(row, qty_i));
                stmt.execute(rusqlite::params![
                    session_id,
                    data_cell(row, num_i),
                    fiche,
                    data_cell(row, type_i),
                    nni,
                    data_cell(row, code_i),
                    data_cell(row, prest_i),
                    if quantite == 0 { 1 } else { quantite },
                    montant,
                    data_cell(row, user_i),
                    data_cell(row, date_i)
                ])
                .map_err(|_| "DB_ERROR".to_string())?;
                cnam_keys.insert(key);
                *cnam_count += 1;
                *inserted += 1;
            }
        }

        conn.execute("COMMIT", []).map_err(|_| "DB_ERROR".to_string())?;
    }

    Ok(())
}

fn import_paths(
    conn: &Connection,
    paths: &[String],
    session_id: i64,
    mode: &str,
    maps: &[SheetColumnMap],
) -> Result<ImportResult, String> {
    if paths.is_empty() {
        return Err("No files provided".to_string());
    }

    let mode_merge = mode == "merge";
    if !mode_merge {
        clear_imported(conn, session_id)?;
    }

    let mut olivex_count = 0;
    let mut cnam_count = 0;
    let mut inserted = 0;
    let mut skipped_dupes = 0;

    for path in paths {
        import_workbook_into(
            conn,
            path,
            session_id,
            mode_merge,
            maps,
            &mut olivex_count,
            &mut cnam_count,
            &mut inserted,
            &mut skipped_dupes,
        )?;
    }

    Ok(ImportResult {
        olivex_count,
        cnam_count,
        inserted,
        skipped_dupes,
    })
}

#[tauri::command]
pub fn preview_excel(file_path: String) -> Result<ImportPreview, String> {
    guard::require_auth()?;
    guard::require_xlsx(&file_path)?;
    let mut workbook: Xlsx<_> = open_workbook(&file_path).map_err(|_| "BAD_FILE".to_string())?;

    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
    let mut sheets = Vec::new();

    for name in &sheet_names {
        if let Ok(range) = workbook.worksheet_range(name) {
            let mut rows = range.rows();
            let Some(header_row) = rows.next() else {
                continue;
            };
            let headers = row_to_strings(header_row);
            let detected_type = detect_sheet_type(&headers);
            let suggested_map = suggest_map(&headers, &detected_type);
            let row_count = range.height().saturating_sub(1) as usize;

            sheets.push(SheetPreview {
                name: name.clone(),
                original_name: name.clone(),
                file_path: file_path.clone(),
                row_count,
                col_count: headers.len(),
                headers,
                detected_type: suggested_map.source.clone(),
                suggested_map,
            });
        }
    }

    Ok(ImportPreview { sheets })
}

#[tauri::command]
pub fn preview_excel_page(
    file_path: String,
    sheet_name: String,
    offset: usize,
    limit: usize,
    search: Option<String>,
) -> Result<PreviewPage, String> {
    guard::require_auth()?;
    guard::require_xlsx(&file_path)?;
    let mut workbook: Xlsx<_> = open_workbook(&file_path).map_err(|_| "BAD_FILE".to_string())?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|_| "BAD_FILE".to_string())?;
    let mut rows = range.rows();
    if rows.next().is_none() {
        return Ok(PreviewPage {
            rows: vec![],
            total: 0,
        });
    }

    let q = search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_lowercase());
    let page_limit = limit.max(1);
    let mut total = 0usize;
    let mut page = Vec::new();

    for row in rows {
        let cells = row_to_strings(row);
        if let Some(ref query) = q {
            if !cells.iter().any(|cell| cell.to_lowercase().contains(query)) {
                continue;
            }
        }
        if total >= offset && page.len() < page_limit {
            page.push(cells);
        }
        total += 1;
    }

    Ok(PreviewPage { rows: page, total })
}

#[tauri::command]
pub fn import_excel(
    db: State<'_, DbState>,
    file_path: String,
    session_id: i64,
) -> Result<ImportResult, String> {
    guard::require_auth()?;
    guard::require_xlsx(&file_path)?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let result = import_paths(&conn, &[file_path], session_id, "replace", &[])?;
    crate::db::audit(&conn, "import", None);
    Ok(result)
}

#[tauri::command]
pub fn import_excel_files(
    db: State<'_, DbState>,
    file_paths: Vec<String>,
    session_id: i64,
    mode: Option<String>,
    maps: Option<Vec<SheetColumnMap>>,
) -> Result<ImportResult, String> {
    guard::require_auth()?;
    for path in &file_paths {
        guard::require_xlsx(path)?;
    }
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let result = import_paths(
        &conn,
        &file_paths,
        session_id,
        mode.as_deref().unwrap_or("replace"),
        maps.as_deref().unwrap_or(&[]),
    )?;
    crate::db::audit(&conn, "import", None);
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_olivex_headers() {
        let headers = vec![
            "N° PC".into(),
            "N° feuille".into(),
            "Mnt. Total".into(),
            "Organisme".into(),
        ];
        assert_eq!(detect_sheet_type(&headers), "olivex");
        let map = suggest_map(&headers, "olivex");
        assert!(map.complete);
        assert_eq!(map.nni, Some(0));
        assert_eq!(map.fiche, Some(1));
        assert_eq!(map.montant, Some(2));
    }

    #[test]
    fn maps_cnam_headers() {
        let headers = vec![
            "INAM".into(),
            "Code FS".into(),
            "Montant facture".into(),
            "Prestation".into(),
        ];
        assert_eq!(detect_sheet_type(&headers), "cnam");
        let map = suggest_map(&headers, "cnam");
        assert!(map.complete);
        assert_eq!(map.nni, Some(0));
        assert_eq!(map.fiche, Some(1));
        assert_eq!(map.montant, Some(2));
    }

    #[test]
    fn parse_european_montant() {
        assert_eq!(parse_montant("1 250,50"), 1250.50);
        assert_eq!(parse_montant("100"), 100.0);
    }
}
