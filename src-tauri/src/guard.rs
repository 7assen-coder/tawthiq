use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Default)]
pub struct AuthSession {
    unlocked: bool,
    fail_count: u32,
    lockout_until: Option<Instant>,
    lockout_level: u32,
}

static AUTH: OnceLock<Mutex<AuthSession>> = OnceLock::new();

pub fn auth() -> &'static Mutex<AuthSession> {
    AUTH.get_or_init(|| Mutex::new(AuthSession::default()))
}

pub fn require_auth() -> Result<(), String> {
    let session = auth().lock().map_err(|_| "AUTH_REQUIRED".to_string())?;
    if session.unlocked {
        Ok(())
    } else {
        Err("AUTH_REQUIRED".to_string())
    }
}

pub fn lock() {
    if let Ok(mut session) = auth().lock() {
        session.unlocked = false;
    }
}

pub fn unlock() {
    if let Ok(mut session) = auth().lock() {
        session.unlocked = true;
        session.fail_count = 0;
        session.lockout_until = None;
    }
}

pub fn lockout_remaining_secs() -> Option<u64> {
    let session = auth().lock().ok()?;
    let until = session.lockout_until?;
    let now = Instant::now();
    if until > now {
        Some(until.saturating_duration_since(now).as_secs().max(1))
    } else {
        None
    }
}

pub fn register_failure() -> u64 {
    let mut session = match auth().lock() {
        Ok(s) => s,
        Err(_) => return 30,
    };
    session.fail_count = session.fail_count.saturating_add(1);
    if session.fail_count < 5 {
        return 0;
    }
    session.fail_count = 0;
    session.lockout_level = session.lockout_level.saturating_add(1).min(3);
    let secs = match session.lockout_level {
        1 => 30,
        2 => 120,
        _ => 600,
    };
    session.lockout_until = Some(Instant::now() + Duration::from_secs(secs));
    secs
}

pub fn clear_failures() {
    if let Ok(mut session) = auth().lock() {
        session.fail_count = 0;
        session.lockout_level = 0;
        session.lockout_until = None;
    }
}

pub fn require_xlsx(path: &str) -> Result<(), String> {
    if path.to_lowercase().ends_with(".xlsx") {
        Ok(())
    } else {
        Err("BAD_FILE".to_string())
    }
}

pub fn require_db_file(path: &str) -> Result<(), String> {
    let lower = path.to_lowercase();
    if lower.ends_with(".db") || lower.ends_with(".sqlite") || lower.ends_with(".sqlite3") {
        Ok(())
    } else {
        Err("BAD_FILE".to_string())
    }
}
