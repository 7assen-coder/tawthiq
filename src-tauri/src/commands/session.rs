use crate::db::DbState;
use crate::guard;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize, Clone)]
pub struct Session {
    pub id: i64,
    pub month: String,
    pub status: String,
    pub archived_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SessionWithSummary {
    pub session: Session,
    pub total_manque: f64,
    pub total_surplus: f64,
    pub conformity_rate: f64,
    pub cas_counts: CasCounts,
}

#[derive(Debug, Serialize, Default)]
pub struct CasCounts {
    pub cas1: i64,
    pub cas2: i64,
    pub cas3: i64,
    pub cas4: i64,
    pub cas5: i64,
    pub cas6: i64,
    pub cas7: i64,
    pub cas8: i64,
}

fn current_month_str() -> String {
    chrono::Local::now().format("%Y-%m").to_string()
}

fn local_now_sql() -> String {
    chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

#[tauri::command]
pub fn get_current_session(db: State<'_, DbState>) -> Result<Session, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let month = current_month_str();

    let result = conn.query_row(
        "SELECT id, month, status, archived_at, created_at FROM sessions WHERE month = ?1",
        [&month],
        |row| {
            Ok(Session {
                id: row.get(0)?,
                month: row.get(1)?,
                status: row.get(2)?,
                archived_at: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    );

    match result {
        Ok(session) => Ok(session),
        Err(_) => {
            conn.execute(
                "INSERT INTO sessions (month, status) VALUES (?1, 'active')",
                [&month],
            )
            .map_err(|e| e.to_string())?;
            let id = conn.last_insert_rowid();
            Ok(Session {
                id,
                month: month.clone(),
                status: "active".to_string(),
                archived_at: None,
                created_at: chrono::Local::now().to_rfc3339(),
            })
        }
    }
}

#[tauri::command]
pub fn check_and_archive_previous(db: State<'_, DbState>) -> Result<Option<String>, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let current = current_month_str();

    let prev_sessions: Vec<(i64, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, month FROM sessions WHERE status = 'active' AND month != ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([&current], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?;
        rows.filter_map(|r| r.ok()).collect()
    };

    let mut archived_month = None;
    for (id, month) in prev_sessions {
        conn.execute(
            "UPDATE sessions SET status = 'archived', archived_at = ?1 WHERE id = ?2",
            rusqlite::params![local_now_sql(), id],
        )
        .map_err(|e| e.to_string())?;
        archived_month = Some(month);
    }

    Ok(archived_month)
}

#[tauri::command]
pub fn get_all_sessions(db: State<'_, DbState>) -> Result<Vec<SessionWithSummary>, String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, month, status, archived_at, created_at FROM sessions ORDER BY month DESC")
        .map_err(|e| e.to_string())?;

    let sessions: Vec<Session> = stmt
        .query_map([], |row| {
            Ok(Session {
                id: row.get(0)?,
                month: row.get(1)?,
                status: row.get(2)?,
                archived_at: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut results = Vec::new();
    for session in sessions {
        let summary = conn
            .query_row(
                "SELECT total_manque, total_surplus, conformity_rate, cas1_count, cas2_count, cas3_count, cas4_count, cas5_count, cas6_count, cas7_count, cas8_count FROM monthly_summaries WHERE session_id = ?1 ORDER BY id DESC LIMIT 1",
                [session.id],
                |row| {
                    Ok((
                        row.get::<_, f64>(0)?,
                        row.get::<_, f64>(1)?,
                        row.get::<_, f64>(2)?,
                        CasCounts {
                            cas1: row.get(3)?,
                            cas2: row.get(4)?,
                            cas3: row.get(5)?,
                            cas4: row.get(6)?,
                            cas5: row.get(7)?,
                            cas6: row.get(8)?,
                            cas7: row.get(9)?,
                            cas8: row.get(10)?,
                        },
                    ))
                },
            );

        let (total_manque, total_surplus, conformity_rate, cas_counts) = match summary {
            Ok((m, s, c, cc)) => (m, s, c, cc),
            Err(_) => (0.0, 0.0, 0.0, CasCounts::default()),
        };

        results.push(SessionWithSummary {
            session,
            total_manque,
            total_surplus,
            conformity_rate,
            cas_counts,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn archive_session(db: State<'_, DbState>, session_id: i64) -> Result<(), String> {
    guard::require_auth()?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    conn.execute(
        "UPDATE sessions SET status = 'archived', archived_at = ?1 WHERE id = ?2",
        rusqlite::params![local_now_sql(), session_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
