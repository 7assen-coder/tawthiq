use crate::commands::access::{self, ContactInfo, ResetEntry};
use crate::db::DbState;
use crate::guard;
use chrono::{Duration, Utc};
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize)]
pub struct PinVerifyResult {
    pub ok: bool,
    pub retry_after_secs: Option<u64>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SetupPinResult {
    pub recovery_code: String,
}

#[derive(Debug, Serialize)]
pub struct TempResetIssue {
    pub code: String,
    pub entry: ResetEntry,
}

fn validate_pin(pin: &str) -> Result<(), String> {
    if pin.len() == 4 && pin.chars().all(|c| c.is_ascii_digit()) {
        Ok(())
    } else {
        Err("PIN_INVALID".to_string())
    }
}

fn generate_recovery_code() -> String {
    let u = uuid::Uuid::new_v4().simple().to_string().to_uppercase();
    let a = &u[0..4];
    let b = &u[4..8];
    format!("TW-{a}-{b}")
}

fn generate_temp_code() -> String {
    // 16-char lowercase alphanumeric without ambiguous 0/O/1/l.
    const ALPHABET: &[u8] = b"abcdefghijkmnopqrstuvwxyz23456789";
    let bytes = uuid::Uuid::new_v4().as_bytes().to_vec();
    let extra = uuid::Uuid::new_v4().as_bytes().to_vec();
    let mut out = String::with_capacity(16);
    for b in bytes.iter().chain(extra.iter()).take(16) {
        out.push(ALPHABET[(*b as usize) % ALPHABET.len()] as char);
    }
    out
}

fn replace_pin_hash(conn: &rusqlite::Connection, new_pin: &str) -> Result<(), String> {
    validate_pin(new_pin)?;
    let id: i64 = conn
        .query_row(
            "SELECT id FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "AUTH_FAILED".to_string())?;
    let new_hash = bcrypt::hash(new_pin, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "UPDATE users SET pin_hash = ?1 WHERE id = ?2",
        rusqlite::params![new_hash, id],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    Ok(())
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
pub fn setup_pin(db: State<'_, DbState>, pin: String) -> Result<SetupPinResult, String> {
    validate_pin(&pin)?;
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
    let recovery_code = generate_recovery_code();
    let recovery_hash =
        bcrypt::hash(&recovery_code, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "INSERT INTO users (pin_hash, recovery_hash, display_name, role) VALUES (?1, ?2, 'Agent', 'operator')",
        rusqlite::params![hash, recovery_hash],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "pin_setup", None);
    guard::unlock();
    Ok(SetupPinResult { recovery_code })
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
    validate_pin(&new_pin)?;
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
pub fn apply_recovery_code(
    db: State<'_, DbState>,
    recovery_code: String,
    new_pin: String,
) -> Result<SetupPinResult, String> {
    validate_pin(&new_pin)?;
    let code = recovery_code.trim().to_uppercase();
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let (id, recovery_hash): (i64, Option<String>) = conn
        .query_row(
            "SELECT id, recovery_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "AUTH_FAILED".to_string())?;
    let Some(recovery_hash) = recovery_hash.filter(|h| !h.is_empty()) else {
        return Err("RECOVERY_MISSING".to_string());
    };
    if !bcrypt::verify(&code, &recovery_hash).unwrap_or(false) {
        return Err("AUTH_FAILED".to_string());
    }
    let new_hash = bcrypt::hash(&new_pin, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    let new_recovery = generate_recovery_code();
    let new_recovery_hash =
        bcrypt::hash(&new_recovery, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "UPDATE users SET pin_hash = ?1, recovery_hash = ?2 WHERE id = ?3",
        rusqlite::params![new_hash, new_recovery_hash, id],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "recovery_ok", None);
    guard::clear_failures();
    guard::unlock();
    Ok(SetupPinResult {
        recovery_code: new_recovery,
    })
}

#[tauri::command]
pub fn apply_temp_reset(
    app: AppHandle,
    db: State<'_, DbState>,
    code: String,
    new_pin: String,
) -> Result<(), String> {
    validate_pin(&new_pin)?;
    let install_id = access::read_or_create_install_id(&app)?;
    let status = access::check_access(app.clone())?;
    // Temp codes are stored lowercase; accept any case from paste.
    let code_trim = code.trim().to_lowercase();
    let now = Utc::now();

    let mut matched: Option<ResetEntry> = None;
    for entry in &status.resets {
        if entry.install_id.trim() != install_id {
            continue;
        }
        if entry.once && access::is_reset_used(&app, &entry.code_hash) {
            continue;
        }
        if let Ok(exp) = chrono::DateTime::parse_from_rfc3339(&entry.expires_at) {
            if exp.with_timezone(&Utc) < now {
                continue;
            }
        } else {
            continue;
        }
        if bcrypt::verify(&code_trim, &entry.code_hash).unwrap_or(false) {
            matched = Some(entry.clone());
            break;
        }
    }

    let Some(entry) = matched else {
        return Err("AUTH_FAILED".to_string());
    };

    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    replace_pin_hash(&conn, &new_pin)?;
    if entry.once {
        access::mark_reset_used(&app, &entry.code_hash)?;
    }
    crate::db::audit(&conn, "temp_reset_ok", None);
    guard::clear_failures();
    guard::unlock();
    Ok(())
}

#[tauri::command]
pub fn has_admin_master_pin(db: State<'_, DbState>) -> Result<bool, String> {
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let hash: Option<String> = conn
        .query_row(
            "SELECT admin_master_pin_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    Ok(hash.map(|h| !h.is_empty()).unwrap_or(false))
}

#[tauri::command]
pub fn setup_admin_master_pin(
    app: AppHandle,
    db: State<'_, DbState>,
    pin: String,
) -> Result<(), String> {
    guard::require_auth()?;
    let status = access::check_access(app)?;
    if !status.is_admin {
        return Err("ADMIN_FORBIDDEN".to_string());
    }
    validate_pin(&pin)?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let existing: Option<String> = conn
        .query_row(
            "SELECT admin_master_pin_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();
    if existing.map(|h| !h.is_empty()).unwrap_or(false) {
        return Err("ADMIN_PIN_EXISTS".to_string());
    }
    let hash = bcrypt::hash(&pin, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    conn.execute(
        "UPDATE users SET admin_master_pin_hash = ?1 WHERE is_active = 1",
        [&hash],
    )
    .map_err(|_| "DB_ERROR".to_string())?;
    crate::db::audit(&conn, "admin_master_setup", None);
    guard::unlock_admin();
    Ok(())
}

#[tauri::command]
pub fn verify_admin_master_pin(
    app: AppHandle,
    db: State<'_, DbState>,
    pin: String,
) -> Result<(), String> {
    guard::require_auth()?;
    let status = access::check_access(app)?;
    if !status.is_admin {
        return Err("ADMIN_FORBIDDEN".to_string());
    }
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let hash: Option<String> = conn
        .query_row(
            "SELECT admin_master_pin_hash FROM users WHERE is_active = 1 ORDER BY id ASC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "AUTH_FAILED".to_string())?;
    let hash = hash
        .filter(|h| !h.is_empty())
        .ok_or_else(|| "ADMIN_PIN_MISSING".to_string())?;
    if !bcrypt::verify(&pin, &hash).unwrap_or(false) {
        return Err("AUTH_FAILED".to_string());
    }
    crate::db::audit(&conn, "admin_unlock", None);
    guard::unlock_admin();
    Ok(())
}

#[tauri::command]
pub fn admin_session_lock() -> Result<(), String> {
    guard::lock_admin();
    Ok(())
}

#[tauri::command]
pub fn admin_session_active() -> bool {
    guard::is_admin_unlocked()
}

#[tauri::command]
pub fn generate_temp_reset(
    app: AppHandle,
    target_install_id: String,
) -> Result<TempResetIssue, String> {
    guard::require_admin()?;
    let status = access::check_access(app)?;
    if !status.is_admin {
        return Err("ADMIN_FORBIDDEN".to_string());
    }
    let target = target_install_id.trim().to_string();
    if target.is_empty() {
        return Err("INVALID_INSTALL_ID".to_string());
    }
    let code = generate_temp_code();
    let code_hash = bcrypt::hash(&code, 10).map_err(|_| "AUTH_FAILED".to_string())?;
    let expires_at = (Utc::now() + Duration::hours(24)).to_rfc3339();
    Ok(TempResetIssue {
        code,
        entry: ResetEntry {
            install_id: target,
            code_hash,
            expires_at,
            force_new_pin: true,
            once: true,
        },
    })
}

#[tauri::command]
pub fn export_access_policy_json(
    revoked_all: bool,
    revoked_install_ids: Vec<String>,
    admin_install_ids: Vec<String>,
    offline_grace_days: i64,
    contact: ContactInfo,
    resets: Vec<ResetEntry>,
    installs: Vec<access::InstallRecord>,
    message_fr: String,
    message_ar: String,
    output_path: String,
) -> Result<String, String> {
    guard::require_admin()?;
    let value = serde_json::json!({
        "revoked_all": revoked_all,
        "revoked_install_ids": revoked_install_ids,
        "admin_install_ids": admin_install_ids,
        "offline_grace_days": offline_grace_days,
        "contact": contact,
        "resets": resets,
        "installs": installs,
        "message_fr": message_fr,
        "message_ar": message_ar,
    });
    let text = serde_json::to_string_pretty(&value).map_err(|_| "DB_ERROR".to_string())?;
    std::fs::write(&output_path, &text).map_err(|_| "DB_ERROR".to_string())?;
    Ok(output_path)
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
