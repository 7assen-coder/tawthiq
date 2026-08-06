use rusqlite::{Connection, Result};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

pub struct DbState(pub Mutex<Connection>);

pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let app_dir = app
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    app_dir.join("tawthiq.db")
}

pub fn init_db(app: &AppHandle) -> Result<Connection> {
    let db_path = get_db_path(app);
    let conn = Connection::open(&db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    conn.execute_batch("PRAGMA busy_timeout=5000;")?;

    run_migrations(&conn, &db_path)?;

    Ok(conn)
}

pub fn audit(conn: &Connection, action: &str, details: Option<&str>) {
    let _ = conn.execute(
        "INSERT INTO audit_log (action, details) VALUES (?1, ?2)",
        rusqlite::params![action, details],
    );
}

fn backup_before_migrate(conn: &Connection, db_path: &std::path::Path, from_version: i64) {
    if from_version < 1 {
        return;
    }
    let Some(dir) = db_path.parent() else {
        return;
    };
    let stamp = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let dest = dir.join(format!("tawthiq.pre_migrate_v{from_version}_{stamp}.db"));
    let dest_s = dest.to_string_lossy().to_string();
    let _ = conn.execute("VACUUM INTO ?1", [dest_s]);
}

fn run_migrations(conn: &Connection, db_path: &std::path::Path) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER PRIMARY KEY
        );",
    )?;

    let current_version: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_version",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 2 && current_version >= 1 {
        backup_before_migrate(conn, db_path, current_version);
    }

    if current_version < 1 {
        conn.execute_batch(include_str!("migrations/001_initial.sql"))?;
        conn.execute("INSERT INTO schema_version (version) VALUES (1)", [])?;
    }
    if current_version < 2 {
        conn.execute_batch(include_str!("migrations/002_perf_indexes.sql"))?;
        conn.execute("INSERT INTO schema_version (version) VALUES (2)", [])?;
    }
    if current_version < 3 {
        if current_version >= 1 {
            backup_before_migrate(conn, db_path, current_version);
        }
        conn.execute_batch(include_str!("migrations/003_auth_recovery.sql"))?;
        conn.execute("INSERT INTO schema_version (version) VALUES (3)", [])?;
    }

    Ok(())
}
