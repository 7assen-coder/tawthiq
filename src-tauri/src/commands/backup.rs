use crate::db::{get_db_path, DbState};
use crate::guard;
use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

fn vacuum_into(conn: &Connection, dest: &str) -> Result<(), String> {
    conn.execute("VACUUM INTO ?1", [dest])
        .map_err(|_| "BACKUP_FAILED".to_string())?;
    Ok(())
}

fn is_sqlite_file(path: &str) -> bool {
    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };
    bytes.len() >= 16 && bytes.starts_with(b"SQLite format 3\0")
}

#[tauri::command]
pub fn backup_database(
    db: State<'_, DbState>,
    output_path: String,
) -> Result<String, String> {
    guard::require_auth()?;
    guard::require_db_file(&output_path)?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    if std::path::Path::new(&output_path).exists() {
        let _ = std::fs::remove_file(&output_path);
    }
    vacuum_into(&conn, &output_path)?;
    crate::db::audit(&conn, "backup", None);
    Ok(output_path)
}

#[tauri::command]
pub fn restore_database(app: AppHandle, input_path: String) -> Result<(), String> {
    guard::require_auth()?;
    guard::require_db_file(&input_path)?;
    if !is_sqlite_file(&input_path) {
        return Err("BAD_FILE".to_string());
    }
    let probe = Connection::open(&input_path).map_err(|_| "BAD_FILE".to_string())?;
    let version: i64 = probe
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);
    if version < 1 {
        return Err("BAD_FILE".to_string());
    }
    drop(probe);

    let db_path = get_db_path(&app);
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let aside = db_path.with_file_name(format!("tawthiq.before_restore_{stamp}.db"));
    let _ = std::fs::copy(&db_path, &aside);

    {
        let state = app.state::<DbState>();
        let locked = state.0.lock();
        if let Ok(conn) = locked {
            crate::db::audit(&conn, "restore", None);
            let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
        }
    }

    std::fs::copy(&input_path, &db_path).map_err(|_| "RESTORE_FAILED".to_string())?;
    let _ = std::fs::remove_file(format!("{}-wal", db_path.display()));
    let _ = std::fs::remove_file(format!("{}-shm", db_path.display()));

    app.restart();
    #[allow(unreachable_code)]
    Ok(())
}

#[tauri::command]
pub fn get_db_location(app: AppHandle) -> Result<String, String> {
    guard::require_auth()?;
    Ok(get_db_path(&app).to_string_lossy().to_string())
}

#[tauri::command]
pub fn auto_backup(db: State<'_, DbState>, app: AppHandle) -> Result<String, String> {
    guard::require_auth()?;
    let db_path = get_db_path(&app);
    let backup_dir = db_path.parent().unwrap().join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|_| "BACKUP_FAILED".to_string())?;

    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = backup_dir.join(format!("tawthiq_auto_{timestamp}.db"));
    let dest = backup_path.to_string_lossy().to_string();

    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    vacuum_into(&conn, &dest)?;
    crate::db::audit(&conn, "auto_backup", None);

    let mut backups: Vec<_> = std::fs::read_dir(&backup_dir)
        .map_err(|_| "BACKUP_FAILED".to_string())?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .starts_with("tawthiq_auto_")
        })
        .collect();
    backups.sort_by_key(|e| std::cmp::Reverse(e.file_name()));
    for old in backups.into_iter().skip(5) {
        let _ = std::fs::remove_file(old.path());
    }

    Ok(dest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn vacuum_into_round_trip() {
        let dir = std::env::temp_dir().join(format!("tawthiq-backup-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let src = dir.join("src.db");
        let dest = dir.join("dest.db");
        let _ = std::fs::remove_file(&dest);

        let conn = Connection::open(&src).unwrap();
        conn.execute_batch(
            "CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
             INSERT INTO schema_version (version) VALUES (1);
             CREATE TABLE t (id INTEGER, nni TEXT);
             INSERT INTO t VALUES (1, '123');",
        )
        .unwrap();
        vacuum_into(&conn, dest.to_str().unwrap()).unwrap();
        assert!(is_sqlite_file(dest.to_str().unwrap()));

        let probe = Connection::open(&dest).unwrap();
        let nni: String = probe
            .query_row("SELECT nni FROM t WHERE id = 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(nni, "123");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn rejects_non_sqlite_header() {
        let path = std::env::temp_dir().join(format!("tawthiq-not-db-{}.txt", std::process::id()));
        std::fs::write(&path, b"hello").unwrap();
        assert!(!is_sqlite_file(path.to_str().unwrap()));
        let _ = std::fs::remove_file(&path);
    }
}
