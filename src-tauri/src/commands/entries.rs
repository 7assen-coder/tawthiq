use crate::db::DbState;
use crate::guard;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OlivexEntry {
    pub id: Option<i64>,
    pub session_id: i64,
    pub ref_code: Option<String>,
    pub organisme: Option<String>,
    pub date: Option<String>,
    pub nni: String,
    pub num_feuille: Option<String>,
    pub nature: Option<String>,
    pub montant: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CnamEntry {
    pub id: Option<i64>,
    pub session_id: i64,
    pub num: Option<String>,
    pub code_fs: Option<String>,
    pub type_auth: Option<String>,
    pub nni: String,
    pub code: Option<String>,
    pub prestation: Option<String>,
    pub quantite: i64,
    pub montant: f64,
    pub user_bio: Option<String>,
    pub date_op: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct EntryCounts {
    pub olivex_count: i64,
    pub cnam_count: i64,
}

#[derive(Debug, Serialize)]
pub struct SourceCounts {
    pub olivex_imported: i64,
    pub olivex_manual: i64,
    pub cnam_imported: i64,
    pub cnam_manual: i64,
}

#[tauri::command]
pub fn get_entry_counts(db: State<'_, DbState>, session_id: i64) -> Result<EntryCounts, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let olivex_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM olivex_entries WHERE session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    let cnam_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM cnam_entries WHERE session_id = ?1",
            [session_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(EntryCounts {
        olivex_count,
        cnam_count,
    })
}

fn count_by_source(conn: &rusqlite::Connection, table: &str, session_id: i64, source: &str) -> Result<i64, String> {
    let sql = format!(
        "SELECT COUNT(*) FROM {} WHERE session_id = ?1 AND source = ?2",
        table
    );
    conn.query_row(&sql, rusqlite::params![session_id, source], |row| row.get(0))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_source_counts(db: State<'_, DbState>, session_id: i64) -> Result<SourceCounts, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    Ok(SourceCounts {
        olivex_imported: count_by_source(&conn, "olivex_entries", session_id, "import")?,
        olivex_manual: count_by_source(&conn, "olivex_entries", session_id, "manual")?,
        cnam_imported: count_by_source(&conn, "cnam_entries", session_id, "import")?,
        cnam_manual: count_by_source(&conn, "cnam_entries", session_id, "manual")?,
    })
}

#[derive(Debug, Serialize)]
pub struct OlivexPage {
    pub entries: Vec<OlivexEntry>,
    pub total: i64,
}

#[derive(Debug, Serialize)]
pub struct CnamPage {
    pub entries: Vec<CnamEntry>,
    pub total: i64,
}

fn search_like(search: &Option<String>) -> Option<String> {
    search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{s}%"))
}

#[tauri::command]
pub fn get_olivex_entries(
    db: State<'_, DbState>,
    session_id: i64,
    offset: i64,
    limit: i64,
    search: Option<String>,
) -> Result<OlivexPage, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let like = search_like(&search);
    let (total, entries) = if let Some(q) = like {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM olivex_entries WHERE session_id = ?1 AND (
                    nni LIKE ?2 OR IFNULL(num_feuille,'') LIKE ?2 OR IFNULL(ref_code,'') LIKE ?2
                    OR IFNULL(organisme,'') LIKE ?2 OR IFNULL(nature,'') LIKE ?2 OR IFNULL(date,'') LIKE ?2
                    OR CAST(montant AS TEXT) LIKE ?2
                )",
                rusqlite::params![session_id, q],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, ref_code, organisme, date, nni, num_feuille, nature, montant FROM olivex_entries WHERE session_id = ?1 AND (
                    nni LIKE ?2 OR IFNULL(num_feuille,'') LIKE ?2 OR IFNULL(ref_code,'') LIKE ?2
                    OR IFNULL(organisme,'') LIKE ?2 OR IFNULL(nature,'') LIKE ?2 OR IFNULL(date,'') LIKE ?2
                    OR CAST(montant AS TEXT) LIKE ?2
                ) ORDER BY id LIMIT ?3 OFFSET ?4",
            )
            .map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map(rusqlite::params![session_id, q, limit.max(1), offset.max(0)], |row| {
                Ok(OlivexEntry {
                    id: Some(row.get(0)?),
                    session_id: row.get(1)?,
                    ref_code: row.get(2)?,
                    organisme: row.get(3)?,
                    date: row.get(4)?,
                    nni: row.get(5)?,
                    num_feuille: row.get(6)?,
                    nature: row.get(7)?,
                    montant: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        (total, entries)
    } else {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM olivex_entries WHERE session_id = ?1",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, ref_code, organisme, date, nni, num_feuille, nature, montant FROM olivex_entries WHERE session_id = ?1 ORDER BY id LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map(rusqlite::params![session_id, limit.max(1), offset.max(0)], |row| {
                Ok(OlivexEntry {
                    id: Some(row.get(0)?),
                    session_id: row.get(1)?,
                    ref_code: row.get(2)?,
                    organisme: row.get(3)?,
                    date: row.get(4)?,
                    nni: row.get(5)?,
                    num_feuille: row.get(6)?,
                    nature: row.get(7)?,
                    montant: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        (total, entries)
    };
    Ok(OlivexPage { entries, total })
}

#[tauri::command]
pub fn get_cnam_entries(
    db: State<'_, DbState>,
    session_id: i64,
    offset: i64,
    limit: i64,
    search: Option<String>,
) -> Result<CnamPage, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let like = search_like(&search);
    let (total, entries) = if let Some(q) = like {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM cnam_entries WHERE session_id = ?1 AND (
                    nni LIKE ?2 OR IFNULL(code_fs,'') LIKE ?2 OR IFNULL(num,'') LIKE ?2
                    OR IFNULL(type_auth,'') LIKE ?2 OR IFNULL(code,'') LIKE ?2 OR IFNULL(prestation,'') LIKE ?2
                    OR IFNULL(user_bio,'') LIKE ?2 OR IFNULL(date_op,'') LIKE ?2
                    OR CAST(montant AS TEXT) LIKE ?2 OR CAST(quantite AS TEXT) LIKE ?2
                )",
                rusqlite::params![session_id, q],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, num, code_fs, type_auth, nni, code, prestation, quantite, montant, user_bio, date_op FROM cnam_entries WHERE session_id = ?1 AND (
                    nni LIKE ?2 OR IFNULL(code_fs,'') LIKE ?2 OR IFNULL(num,'') LIKE ?2
                    OR IFNULL(type_auth,'') LIKE ?2 OR IFNULL(code,'') LIKE ?2 OR IFNULL(prestation,'') LIKE ?2
                    OR IFNULL(user_bio,'') LIKE ?2 OR IFNULL(date_op,'') LIKE ?2
                    OR CAST(montant AS TEXT) LIKE ?2 OR CAST(quantite AS TEXT) LIKE ?2
                ) ORDER BY id LIMIT ?3 OFFSET ?4",
            )
            .map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map(rusqlite::params![session_id, q, limit.max(1), offset.max(0)], |row| {
                Ok(CnamEntry {
                    id: Some(row.get(0)?),
                    session_id: row.get(1)?,
                    num: row.get(2)?,
                    code_fs: row.get(3)?,
                    type_auth: row.get(4)?,
                    nni: row.get(5)?,
                    code: row.get(6)?,
                    prestation: row.get(7)?,
                    quantite: row.get(8)?,
                    montant: row.get(9)?,
                    user_bio: row.get(10)?,
                    date_op: row.get(11)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        (total, entries)
    } else {
        let total: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM cnam_entries WHERE session_id = ?1",
                [session_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, session_id, num, code_fs, type_auth, nni, code, prestation, quantite, montant, user_bio, date_op FROM cnam_entries WHERE session_id = ?1 ORDER BY id LIMIT ?2 OFFSET ?3",
            )
            .map_err(|e| e.to_string())?;
        let entries = stmt
            .query_map(rusqlite::params![session_id, limit.max(1), offset.max(0)], |row| {
                Ok(CnamEntry {
                    id: Some(row.get(0)?),
                    session_id: row.get(1)?,
                    num: row.get(2)?,
                    code_fs: row.get(3)?,
                    type_auth: row.get(4)?,
                    nni: row.get(5)?,
                    code: row.get(6)?,
                    prestation: row.get(7)?,
                    quantite: row.get(8)?,
                    montant: row.get(9)?,
                    user_bio: row.get(10)?,
                    date_op: row.get(11)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        (total, entries)
    };
    Ok(CnamPage { entries, total })
}

#[tauri::command]
pub fn add_olivex_entry(db: State<'_, DbState>, entry: OlivexEntry) -> Result<i64, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO olivex_entries (session_id, ref_code, organisme, date, nni, num_feuille, nature, montant, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'manual')",
        rusqlite::params![entry.session_id, entry.ref_code, entry.organisme, entry.date, entry.nni, entry.num_feuille, entry.nature, entry.montant],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn add_cnam_entry(db: State<'_, DbState>, entry: CnamEntry) -> Result<i64, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO cnam_entries (session_id, num, code_fs, type_auth, nni, code, prestation, quantite, montant, user_bio, date_op, source) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'manual')",
        rusqlite::params![entry.session_id, entry.num, entry.code_fs, entry.type_auth, entry.nni, entry.code, entry.prestation, entry.quantite, entry.montant, entry.user_bio, entry.date_op],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_olivex_entry(db: State<'_, DbState>, entry: OlivexEntry) -> Result<(), String> {
    guard::require_auth()?;
    let id = entry.id.ok_or("Entry ID required")?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE olivex_entries SET ref_code=?1, organisme=?2, date=?3, nni=?4, num_feuille=?5, nature=?6, montant=?7 WHERE id=?8",
        rusqlite::params![entry.ref_code, entry.organisme, entry.date, entry.nni, entry.num_feuille, entry.nature, entry.montant, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn update_cnam_entry(db: State<'_, DbState>, entry: CnamEntry) -> Result<(), String> {
    guard::require_auth()?;
    let id = entry.id.ok_or("Entry ID required")?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE cnam_entries SET num=?1, code_fs=?2, type_auth=?3, nni=?4, code=?5, prestation=?6, quantite=?7, montant=?8, user_bio=?9, date_op=?10 WHERE id=?11",
        rusqlite::params![entry.num, entry.code_fs, entry.type_auth, entry.nni, entry.code, entry.prestation, entry.quantite, entry.montant, entry.user_bio, entry.date_op, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn delete_entry(
    db: State<'_, DbState>,
    entry_type: String,
    entry_id: i64,
) -> Result<(), String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let table = match entry_type.as_str() {
        "olivex" => "olivex_entries",
        "cnam" => "cnam_entries",
        _ => return Err("Invalid entry type".to_string()),
    };
    conn.execute(&format!("DELETE FROM {} WHERE id = ?1", table), [entry_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
