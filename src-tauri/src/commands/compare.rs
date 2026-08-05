use crate::db::DbState;
use crate::engine::reconciliation;
use crate::guard;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct CompareResult {
    pub total_manque: f64,
    pub total_surplus: f64,
    pub conformity_rate: f64,
    pub cas_counts: CasCountsResult,
    pub results: Vec<reconciliation::ComparisonResult>,
}

#[derive(Debug, Serialize)]
pub struct CasCountsResult {
    pub cas1: i64,
    pub cas2: i64,
    pub cas3: i64,
    pub cas4: i64,
    pub cas5: i64,
    pub cas6: i64,
    pub cas7: i64,
    pub cas8: i64,
}

#[derive(Debug, Serialize)]
pub struct ComparisonPage {
    pub entries: Vec<reconciliation::ComparisonResult>,
    pub total: i64,
    pub total_difference: f64,
}

#[tauri::command]
pub fn run_comparison(
    db: State<'_, DbState>,
    session_id: i64,
) -> Result<CompareResult, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;

    // Clear previous results
    conn.execute(
        "DELETE FROM comparison_results WHERE session_id = ?1",
        [session_id],
    )
    .map_err(|e| e.to_string())?;

    // Load OLIVEX entries: (nni, fiche, montant, nature, date)
    let mut stmt = conn
        .prepare("SELECT nni, num_feuille, montant, COALESCE(nature, ''), COALESCE(date, '') FROM olivex_entries WHERE session_id = ?1")
        .map_err(|e| e.to_string())?;
    let olivex_rows: Vec<(String, String, f64, String, String)> = stmt
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    // Load CNAM entries: (nni, code_fs, montant, date_op)
    let mut stmt = conn
        .prepare("SELECT nni, code_fs, montant, COALESCE(date_op, '') FROM cnam_entries WHERE session_id = ?1")
        .map_err(|e| e.to_string())?;
    let cnam_rows: Vec<(String, String, f64, String)> = stmt
        .query_map([session_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1).unwrap_or_default(),
                row.get::<_, f64>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let summary = reconciliation::run_comparison(olivex_rows, cnam_rows);

    // Store results
    let tx_result = conn.execute("BEGIN TRANSACTION", []);
    if tx_result.is_err() {
        let _ = conn.execute("ROLLBACK", []);
        conn.execute("BEGIN TRANSACTION", []).map_err(|e| e.to_string())?;
    }

    {
        let mut stmt = conn.prepare(
            "INSERT INTO comparison_results (session_id, cas, nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference, nature) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        ).map_err(|_| "DB_ERROR".to_string())?;
        for r in &summary.results {
            stmt.execute(rusqlite::params![
                session_id, r.cas, r.nni, r.fiche_olivex, r.fiche_cnam,
                r.montant_olivex, r.montant_cnam, r.difference, r.nature
            ]).map_err(|_| "DB_ERROR".to_string())?;
        }
    }

    // Store/update monthly summary
    conn.execute(
        "DELETE FROM monthly_summaries WHERE session_id = ?1",
        [session_id],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO monthly_summaries (session_id, total_manque, total_surplus, total_conforme, total_manuel, cas1_count, cas2_count, cas3_count, cas4_count, cas5_count, cas6_count, cas7_count, cas8_count, conformity_rate) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        rusqlite::params![
            session_id,
            summary.total_manque,
            summary.total_surplus,
            summary.cas_counts[0] + summary.cas_counts[1] + summary.cas_counts[6],
            summary.cas_counts[4],
            summary.cas_counts[0], summary.cas_counts[1], summary.cas_counts[2], summary.cas_counts[3],
            summary.cas_counts[4], summary.cas_counts[5], summary.cas_counts[6],
            0i64, // cas8 retired — keep column for schema compat
            summary.conformity_rate
        ],
    ).map_err(|e| e.to_string())?;

    conn.execute("COMMIT", []).map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "compare", None);

    Ok(CompareResult {
        total_manque: summary.total_manque,
        total_surplus: summary.total_surplus,
        conformity_rate: summary.conformity_rate,
        cas_counts: CasCountsResult {
            cas1: summary.cas_counts[0],
            cas2: summary.cas_counts[1],
            cas3: summary.cas_counts[2],
            cas4: summary.cas_counts[3],
            cas5: summary.cas_counts[4],
            cas6: summary.cas_counts[5],
            cas7: summary.cas_counts[6],
            cas8: 0,
        },
        results: vec![],
    })
}

#[tauri::command]
pub fn get_comparison_results(
    db: State<'_, DbState>,
    session_id: i64,
    cas_filter: Option<String>,
    offset: Option<i64>,
    limit: Option<i64>,
    search: Option<String>,
) -> Result<ComparisonPage, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let like = search
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| format!("%{s}%"));
    let off = offset.unwrap_or(0).max(0);
    let lim = limit.unwrap_or(30).max(1);

    let map_row = |row: &rusqlite::Row| -> rusqlite::Result<reconciliation::ComparisonResult> {
        Ok(reconciliation::ComparisonResult {
            cas: row.get(0)?,
            nni: row.get(1)?,
            fiche_olivex: row.get(2)?,
            fiche_cnam: row.get(3)?,
            montant_olivex: row.get(4)?,
            montant_cnam: row.get(5)?,
            difference: row.get(6)?,
            nature: row.get(7)?,
        })
    };

    let (total, total_difference, entries) = if let Some(ref cas) = cas_filter {
        if let Some(ref q) = like {
            let (total, total_difference): (i64, f64) = conn.query_row(
                "SELECT COUNT(*), COALESCE(SUM(ABS(difference)),0) FROM comparison_results WHERE session_id = ?1 AND cas = ?2 AND (nni LIKE ?3 OR IFNULL(fiche_olivex,'') LIKE ?3 OR IFNULL(fiche_cnam,'') LIKE ?3)",
                rusqlite::params![session_id, cas, q],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map_err(|_| "DB_ERROR".to_string())?;
            let mut stmt = conn.prepare(
                "SELECT cas, nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference, nature FROM comparison_results WHERE session_id = ?1 AND cas = ?2 AND (nni LIKE ?3 OR IFNULL(fiche_olivex,'') LIKE ?3 OR IFNULL(fiche_cnam,'') LIKE ?3) ORDER BY difference DESC LIMIT ?4 OFFSET ?5"
            ).map_err(|_| "DB_ERROR".to_string())?;
            let entries = stmt.query_map(rusqlite::params![session_id, cas, q, lim, off], map_row)
                .map_err(|_| "DB_ERROR".to_string())?
                .filter_map(|r| r.ok())
                .collect();
            (total, total_difference, entries)
        } else {
            let (total, total_difference): (i64, f64) = conn.query_row(
                "SELECT COUNT(*), COALESCE(SUM(ABS(difference)),0) FROM comparison_results WHERE session_id = ?1 AND cas = ?2",
                rusqlite::params![session_id, cas],
                |row| Ok((row.get(0)?, row.get(1)?)),
            ).map_err(|_| "DB_ERROR".to_string())?;
            let mut stmt = conn.prepare(
                "SELECT cas, nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference, nature FROM comparison_results WHERE session_id = ?1 AND cas = ?2 ORDER BY difference DESC LIMIT ?3 OFFSET ?4"
            ).map_err(|_| "DB_ERROR".to_string())?;
            let entries = stmt.query_map(rusqlite::params![session_id, cas, lim, off], map_row)
                .map_err(|_| "DB_ERROR".to_string())?
                .filter_map(|r| r.ok())
                .collect();
            (total, total_difference, entries)
        }
    } else {
        let (total, total_difference): (i64, f64) = conn.query_row(
            "SELECT COUNT(*), COALESCE(SUM(ABS(difference)),0) FROM comparison_results WHERE session_id = ?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(|_| "DB_ERROR".to_string())?;
        let mut stmt = conn.prepare(
            "SELECT cas, nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference, nature FROM comparison_results WHERE session_id = ?1 ORDER BY cas, difference DESC LIMIT ?2 OFFSET ?3"
        ).map_err(|_| "DB_ERROR".to_string())?;
        let entries = stmt.query_map(rusqlite::params![session_id, lim, off], map_row)
            .map_err(|_| "DB_ERROR".to_string())?
            .filter_map(|r| r.ok())
            .collect();
        (total, total_difference, entries)
    };

    Ok(ComparisonPage {
        entries,
        total,
        total_difference,
    })
}

#[tauri::command]
pub fn get_latest_compare_result(
    db: State<'_, DbState>,
    session_id: i64,
) -> Result<Option<CompareResult>, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;

    let summary = conn.query_row(
        "SELECT total_manque, total_surplus, conformity_rate, cas1_count, cas2_count, cas3_count, cas4_count, cas5_count, cas6_count, cas7_count, cas8_count FROM monthly_summaries WHERE session_id = ?1 ORDER BY id DESC LIMIT 1",
        [session_id],
        |row| {
            Ok((
                row.get::<_, f64>(0)?,
                row.get::<_, f64>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
                row.get::<_, i64>(9)?,
                row.get::<_, i64>(10).unwrap_or(0),
            ))
        },
    );

    let Ok((total_manque, total_surplus, conformity_rate, c1, c2, c3, c4, c5, c6, c7, c8)) = summary else {
        return Ok(None);
    };

    if c1 + c2 + c3 + c4 + c5 + c6 + c7 == 0 && total_manque == 0.0 && total_surplus == 0.0 {
        return Ok(None);
    }

    Ok(Some(CompareResult {
        total_manque,
        total_surplus,
        conformity_rate,
        cas_counts: CasCountsResult {
            cas1: c1,
            cas2: c2,
            cas3: c3,
            cas4: c4,
            cas5: c5,
            cas6: c6,
            cas7: c7,
            cas8: c8,
        },
        results: vec![],
    }))
}

#[tauri::command]
pub fn update_resolution(
    db: State<'_, DbState>,
    result_id: i64,
    status: String,
    note: Option<String>,
) -> Result<(), String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    conn.execute(
        "UPDATE comparison_results SET resolution_status = ?1, resolution_note = ?2, resolved = CASE WHEN ?1 = 'resolu' THEN 1 ELSE 0 END WHERE id = ?3",
        rusqlite::params![status, note, result_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
