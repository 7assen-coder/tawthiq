use crate::db::DbState;
use crate::guard;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct PinVerifyResult {
    pub ok: bool,
    pub retry_after_secs: Option<u64>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn has_pin(db: State<'_, DbState>) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "DB_ERROR".to_string())?;
    Ok(count > 0)
}

#[tauri::command]
pub fn setup_pin(db: State<'_, DbState>, pin: String) -> Result<(), String> {
    if pin.len() != 4 || !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN_INVALID".to_string());
    }
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |row| {
            row.get(0)
        })
        .map_err(|_| "DB_ERROR".to_string())?;
    if count > 0 {
        return Err("PIN_EXISTS".to_string());
    }
    let hash = bcrypt::hash(&pin, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "INSERT INTO users (pin_hash, display_name, role) VALUES (?1, 'Agent', 'operator')",
        [&hash],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "pin_setup", None);
    guard::unlock();
    Ok(())
}

#[tauri::command]
pub fn verify_pin(db: State<'_, DbState>, pin: String) -> Result<PinVerifyResult, String> {
    if let Some(secs) = guard::lockout_remaining_secs() {
        return Ok(PinVerifyResult {
            ok: false,
            retry_after_secs: Some(secs),
            error: Some("LOCKED".to_string()),
        });
    }

    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let hash: String = match conn.query_row(
        "SELECT pin_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
        [],
        |row| row.get(0),
    ) {
        Ok(h) => h,
        Err(_) => {
            return Ok(PinVerifyResult {
                ok: false,
                retry_after_secs: None,
                error: Some("AUTH_FAILED".to_string()),
            });
        }
    };

    if bcrypt::verify(&pin, &hash).unwrap_or(false) {
        guard::clear_failures();
        guard::unlock();
        crate::db::audit(&conn, "unlock_ok", None);
        Ok(PinVerifyResult {
            ok: true,
            retry_after_secs: None,
            error: None,
        })
    } else {
        crate::db::audit(&conn, "unlock_fail", None);
        let wait = guard::register_failure();
        Ok(PinVerifyResult {
            ok: false,
            retry_after_secs: if wait > 0 { Some(wait) } else { None },
            error: Some(if wait > 0 {
                "LOCKED".to_string()
            } else {
                "AUTH_FAILED".to_string()
            }),
        })
    }
}

#[tauri::command]
pub fn change_pin(
    db: State<'_, DbState>,
    old_pin: String,
    new_pin: String,
) -> Result<(), String> {
    guard::require_auth()?;
    if new_pin.len() != 4 || !new_pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN_INVALID".to_string());
    }
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let (id, hash): (i64, String) = conn
        .query_row(
            "SELECT id, pin_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "AUTH_FAILED".to_string())?;

    if !bcrypt::verify(&old_pin, &hash).unwrap_or(false) {
        return Err("AUTH_FAILED".to_string());
    }

    let new_hash = bcrypt::hash(&new_pin, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "UPDATE users SET pin_hash = ?1 WHERE id = ?2",
        rusqlite::params![new_hash, id],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "pin_change", None);
    Ok(())
}

#[tauri::command]
pub fn lock_session() -> Result<(), String> {
    guard::lock();
    Ok(())
}

#[tauri::command]
pub fn get_app_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
