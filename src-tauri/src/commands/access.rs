use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const ACCESS_URL: &str = "https://raw.githubusercontent.com/7assen-coder/tawthiq/main/access.json";
const ACCESS_SIG_URL: &str =
    "https://raw.githubusercontent.com/7assen-coder/tawthiq/main/access.json.sig";
const REGISTRY_URL: &str = "https://tawthiq-install-registry.tawthiq.workers.dev";
const DEFAULT_WHATSAPP: &str = "+22241824343";
const DEFAULT_EMAIL: &str = "MoHasseenn@gmail.com";
const DEFAULT_GRACE_DAYS: i64 = 2;

/// Ed25519 public key (32 bytes) for access.json signatures.
/// Private key lives only at ~/.config/tawthiq/access-signing.key (never ship it).
const ACCESS_VERIFYING_KEY_BYTES: [u8; 32] = [
    0xec, 0xce, 0xf2, 0x83, 0xac, 0x10, 0xad, 0xa0, 0xb0, 0xf8, 0x8d, 0xcb, 0x4e, 0x3a, 0xb2, 0xca,
    0xe3, 0x00, 0x99, 0x7e, 0x81, 0xaa, 0x7d, 0x2d, 0xab, 0xd5, 0x6e, 0xba, 0xff, 0x95, 0xeb, 0x71,
];

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ContactInfo {
    #[serde(default = "default_whatsapp")]
    pub whatsapp: String,
    #[serde(default = "default_email")]
    pub email: String,
}

fn default_whatsapp() -> String {
    DEFAULT_WHATSAPP.into()
}
fn default_email() -> String {
    DEFAULT_EMAIL.into()
}

impl Default for ContactInfo {
    fn default() -> Self {
        Self {
            whatsapp: default_whatsapp(),
            email: default_email(),
        }
    }
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ResetEntry {
    pub install_id: String,
    pub code_hash: String,
    pub expires_at: String,
    #[serde(default = "default_true")]
    pub force_new_pin: bool,
    #[serde(default = "default_true")]
    pub once: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct InstallRecord {
    pub id: String,
    #[serde(default)]
    pub label: String,
    #[serde(default = "default_platform")]
    pub platform: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hostname: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
}

fn default_platform() -> String {
    "unknown".into()
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct RemoteAccess {
    #[serde(default)]
    revoked_all: bool,
    #[serde(default)]
    revoked_install_ids: Vec<String>,
    #[serde(default)]
    admin_install_ids: Vec<String>,
    #[serde(default = "default_grace")]
    offline_grace_days: i64,
    #[serde(default)]
    contact: ContactInfo,
    #[serde(default)]
    resets: Vec<ResetEntry>,
    #[serde(default)]
    installs: Vec<InstallRecord>,
    #[serde(default)]
    message_fr: Option<String>,
    #[serde(default)]
    message_ar: Option<String>,
}

fn default_grace() -> i64 {
    DEFAULT_GRACE_DAYS
}

#[derive(Debug, Serialize, Clone)]
pub struct AccessStatus {
    pub install_id: String,
    pub revoked: bool,
    pub offline_locked: bool,
    pub is_admin: bool,
    pub offline_grace_days: i64,
    pub contact: ContactInfo,
    pub resets: Vec<ResetEntry>,
    pub revoked_install_ids: Vec<String>,
    pub admin_install_ids: Vec<String>,
    pub installs: Vec<InstallRecord>,
    pub message_fr: String,
    pub message_ar: String,
}

#[derive(Debug, Deserialize)]
struct SeenListResponse {
    installs: Vec<SeenInstall>,
}

#[derive(Debug, Deserialize)]
struct SeenInstall {
    id: String,
    #[serde(default)]
    label: String,
    #[serde(default)]
    platform: String,
    #[serde(default)]
    hostname: String,
    #[serde(default)]
    app_version: String,
    #[serde(default)]
    notes: String,
    #[serde(default)]
    last_seen: String,
}

fn app_data_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "DB_ERROR".to_string())?;
    std::fs::create_dir_all(&dir).map_err(|_| "DB_ERROR".to_string())?;
    Ok(dir)
}

fn install_id_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("install_id"))
}

fn revoked_flag_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("access_revoked"))
}

fn last_online_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("last_online_utc"))
}

fn offline_lock_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("offline_lock"))
}

fn clock_watermark_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("clock_watermark_utc"))
}

fn first_launch_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("first_launch_utc"))
}

fn reset_used_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app_data_dir(app)?.join("reset_used");
    std::fs::create_dir_all(&dir).map_err(|_| "DB_ERROR".to_string())?;
    Ok(dir)
}

pub fn read_or_create_install_id(app: &AppHandle) -> Result<String, String> {
    let path = install_id_path(app)?;
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let trimmed = existing.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    std::fs::write(&path, &id).map_err(|_| "DB_ERROR".to_string())?;
    Ok(id)
}

fn local_revoked(app: &AppHandle) -> bool {
    revoked_flag_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .map(|s| s.trim() == "1")
        .unwrap_or(false)
}

fn set_local_revoked(app: &AppHandle, revoked: bool) {
    if let Ok(path) = revoked_flag_path(app) {
        if revoked {
            let _ = std::fs::write(path, "1");
        } else {
            let _ = std::fs::remove_file(path);
        }
    }
}

fn now_unix() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn read_i64_file(path: &std::path::Path) -> Option<i64> {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| s.trim().parse().ok())
}

fn write_i64_file(path: &std::path::Path, value: i64) {
    let _ = std::fs::write(path, value.to_string());
}

fn ensure_first_launch(app: &AppHandle, now: i64) -> i64 {
    let Ok(path) = first_launch_path(app) else {
        return now;
    };
    if let Some(existing) = read_i64_file(&path) {
        return existing;
    }
    write_i64_file(&path, now);
    now
}

fn update_watermark(app: &AppHandle, now: i64) {
    let Ok(path) = clock_watermark_path(app) else {
        return;
    };
    let prev = read_i64_file(&path).unwrap_or(0);
    if now > prev {
        write_i64_file(&path, now);
    }
}

fn clock_tampered(app: &AppHandle, now: i64) -> bool {
    let Ok(path) = clock_watermark_path(app) else {
        return false;
    };
    let Some(watermark) = read_i64_file(&path) else {
        return false;
    };
    now + 3600 < watermark
}

/// Pure grace evaluation for unit tests.
pub fn offline_grace_exceeded(
    now: i64,
    last_online: Option<i64>,
    first_launch: i64,
    grace_days: i64,
    clock_rolled_back: bool,
) -> bool {
    if clock_rolled_back {
        return true;
    }
    let grace_secs = grace_days.max(0) * 86_400;
    let anchor = last_online.unwrap_or(first_launch);
    now.saturating_sub(anchor) > grace_secs
}

fn eval_offline_lock(app: &AppHandle, is_admin: bool, grace_days: i64, online_ok: bool) -> bool {
    if is_admin {
        if let Ok(path) = offline_lock_path(app) {
            let _ = std::fs::remove_file(path);
        }
        return false;
    }

    let now = now_unix();
    update_watermark(app, now);
    let first = ensure_first_launch(app, now);
    let tampered = clock_tampered(app, now);

    if online_ok {
        if let Ok(path) = last_online_path(app) {
            write_i64_file(&path, now);
        }
        if let Ok(path) = offline_lock_path(app) {
            let _ = std::fs::remove_file(path);
        }
        return false;
    }

    let last = last_online_path(app)
        .ok()
        .and_then(|p| read_i64_file(&p));
    let exceeded = offline_grace_exceeded(now, last, first, grace_days, tampered);
    if exceeded {
        if let Ok(path) = offline_lock_path(app) {
            let _ = std::fs::write(path, "1");
        }
    }
    exceeded
        || offline_lock_path(app)
            .ok()
            .and_then(|p| std::fs::read_to_string(p).ok())
            .map(|s| s.trim() == "1")
            .unwrap_or(false)
}

fn default_messages() -> (String, String) {
    (
        "Accès révoqué. Contactez l’éditeur.".into(),
        "تم إلغاء الوصول. تواصل مع الناشر.".into(),
    )
}

fn http_agent() -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(5))
        .build()
}

pub fn verify_access_policy_bytes(policy: &[u8], sig_b64: &str) -> bool {
    let Ok(vk) = VerifyingKey::from_bytes(&ACCESS_VERIFYING_KEY_BYTES) else {
        return false;
    };
    let Ok(sig_bytes) = base64::engine::general_purpose::STANDARD.decode(sig_b64.trim()) else {
        return false;
    };
    let Ok(sig) = Signature::from_slice(&sig_bytes) else {
        return false;
    };
    vk.verify(policy, &sig).is_ok()
}

fn fetch_remote() -> Option<RemoteAccess> {
    let agent = http_agent();
    let resp = agent.get(ACCESS_URL).call().ok()?;
    let text = resp.into_string().ok()?;
    let sig_resp = agent.get(ACCESS_SIG_URL).call().ok()?;
    let sig = sig_resp.into_string().ok()?;
    if !verify_access_policy_bytes(text.as_bytes(), &sig) {
        log::warn!("access.json signature verification failed");
        return None;
    }
    serde_json::from_str(&text).ok()
}

fn platform_label() -> String {
    match std::env::consts::OS {
        "macos" => "macos".into(),
        "windows" => "windows".into(),
        "linux" => "linux".into(),
        other => other.into(),
    }
}

fn send_heartbeat(install_id: &str) {
    let body = serde_json::json!({
        "install_id": install_id,
        "platform": platform_label(),
        "hostname": whoami::fallible::hostname().unwrap_or_default(),
        "app_version": env!("CARGO_PKG_VERSION"),
    });
    let agent = http_agent();
    let _ = agent
        .post(&format!("{REGISTRY_URL}/v1/heartbeat"))
        .set("content-type", "application/json")
        .send_json(body);
}

fn fetch_seen_installs(admin_install_id: &str) -> Vec<InstallRecord> {
    let agent = http_agent();
    let Ok(resp) = agent
        .get(&format!("{REGISTRY_URL}/v1/seen"))
        .set("X-Install-Id", admin_install_id)
        .call()
    else {
        return vec![];
    };
    let Ok(parsed) = resp.into_json::<SeenListResponse>() else {
        return vec![];
    };
    parsed
        .installs
        .into_iter()
        .map(|s| {
            let hostname = s.hostname.trim().to_string();
            let label = if !s.label.trim().is_empty() {
                s.label
            } else if !hostname.is_empty() {
                hostname.clone()
            } else {
                String::new()
            };
            InstallRecord {
                id: s.id,
                label,
                platform: if s.platform.is_empty() {
                    "unknown".into()
                } else {
                    s.platform
                },
                notes: s.notes,
                hostname: if hostname.is_empty() {
                    None
                } else {
                    Some(hostname)
                },
                app_version: if s.app_version.is_empty() {
                    None
                } else {
                    Some(s.app_version)
                },
                last_seen: if s.last_seen.is_empty() {
                    None
                } else {
                    Some(s.last_seen)
                },
            }
        })
        .collect()
}

fn merge_installs(policy: &[InstallRecord], seen: &[InstallRecord]) -> Vec<InstallRecord> {
    let mut map = std::collections::HashMap::<String, InstallRecord>::new();
    for item in policy {
        let id = item.id.trim().to_string();
        if id.is_empty() {
            continue;
        }
        map.insert(id.clone(), item.clone());
    }
    for item in seen {
        let id = item.id.trim().to_string();
        if id.is_empty() {
            continue;
        }
        match map.get_mut(&id) {
            Some(existing) => {
                if existing.label.trim().is_empty() && !item.label.trim().is_empty() {
                    existing.label = item.label.clone();
                }
                if existing.platform == "unknown" && item.platform != "unknown" {
                    existing.platform = item.platform.clone();
                }
                if existing.hostname.is_none() {
                    existing.hostname = item.hostname.clone();
                }
                if existing.app_version.is_none() {
                    existing.app_version = item.app_version.clone();
                }
                existing.last_seen = item.last_seen.clone().or(existing.last_seen.clone());
                if existing.notes.trim().is_empty() && !item.notes.trim().is_empty() {
                    existing.notes = item.notes.clone();
                }
            }
            None => {
                map.insert(id, item.clone());
            }
        }
    }
    map.into_values().collect()
}

fn cached_policy_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    Ok(app_data_dir(app)?.join("access_policy_cache.json"))
}

fn cache_policy(app: &AppHandle, remote: &RemoteAccess) {
    if let Ok(path) = cached_policy_path(app) {
        if let Ok(text) = serde_json::to_string(remote) {
            let _ = std::fs::write(path, text);
        }
    }
}

fn load_cached_policy(app: &AppHandle) -> Option<RemoteAccess> {
    let path = cached_policy_path(app).ok()?;
    let text = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
pub fn check_access(app: AppHandle) -> Result<AccessStatus, String> {
    let install_id = read_or_create_install_id(&app)?;
    let (default_fr, default_ar) = default_messages();

    let (remote, online_ok) = match fetch_remote() {
        Some(r) => {
            cache_policy(&app, &r);
            send_heartbeat(&install_id);
            (Some(r), true)
        }
        None => (load_cached_policy(&app), false),
    };

    let grace_days = remote
        .as_ref()
        .map(|r| r.offline_grace_days)
        .unwrap_or(DEFAULT_GRACE_DAYS);
    let is_admin = remote
        .as_ref()
        .map(|r| {
            r.admin_install_ids
                .iter()
                .any(|id| id.trim() == install_id)
        })
        .unwrap_or(false);

    let offline_locked = eval_offline_lock(&app, is_admin, grace_days, online_ok);

    if let Some(remote) = remote {
        let revoked = remote.revoked_all
            || remote
                .revoked_install_ids
                .iter()
                .any(|id| id.trim() == install_id);
        set_local_revoked(&app, revoked);
        if revoked {
            crate::guard::lock();
        }
        if offline_locked && !is_admin {
            crate::guard::lock();
        }
        let mut installs = remote.installs.clone();
        if is_admin && online_ok {
            let seen = fetch_seen_installs(&install_id);
            installs = merge_installs(&installs, &seen);
        }
        return Ok(AccessStatus {
            install_id,
            revoked,
            offline_locked: offline_locked && !is_admin,
            is_admin,
            offline_grace_days: remote.offline_grace_days,
            contact: remote.contact,
            resets: remote.resets,
            revoked_install_ids: remote.revoked_install_ids,
            admin_install_ids: remote.admin_install_ids,
            installs,
            message_fr: remote.message_fr.unwrap_or(default_fr),
            message_ar: remote.message_ar.unwrap_or(default_ar),
        });
    }

    let revoked = local_revoked(&app);
    if revoked || (offline_locked && !is_admin) {
        crate::guard::lock();
    }
    Ok(AccessStatus {
        install_id,
        revoked,
        offline_locked: offline_locked && !is_admin,
        is_admin: false,
        offline_grace_days: grace_days,
        contact: ContactInfo::default(),
        resets: vec![],
        revoked_install_ids: vec![],
        admin_install_ids: vec![],
        installs: vec![],
        message_fr: default_fr,
        message_ar: default_ar,
    })
}

#[tauri::command]
pub fn get_install_id(app: AppHandle) -> Result<String, String> {
    crate::guard::require_auth()?;
    read_or_create_install_id(&app)
}

#[tauri::command]
pub fn get_public_install_id(app: AppHandle) -> Result<String, String> {
    read_or_create_install_id(&app)
}

#[tauri::command]
pub fn get_support_contact(app: AppHandle) -> Result<ContactInfo, String> {
    if let Some(cached) = load_cached_policy(&app) {
        return Ok(cached.contact);
    }
    Ok(ContactInfo::default())
}

pub fn mark_reset_used(app: &AppHandle, code_hash: &str) -> Result<(), String> {
    let dir = reset_used_dir(app)?;
    let safe: String = code_hash
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    let path = dir.join(safe);
    std::fs::write(path, "1").map_err(|_| "DB_ERROR".to_string())
}

pub fn is_reset_used(app: &AppHandle, code_hash: &str) -> bool {
    let Ok(dir) = reset_used_dir(app) else {
        return false;
    };
    let safe: String = code_hash
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();
    dir.join(safe).exists()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn grace_allows_exactly_two_days() {
        let first = 1_000_000;
        let two_days = 2 * 86_400;
        assert!(!offline_grace_exceeded(
            first + two_days,
            Some(first),
            first,
            2,
            false
        ));
        assert!(offline_grace_exceeded(
            first + two_days + 1,
            Some(first),
            first,
            2,
            false
        ));
    }

    #[test]
    fn grace_uses_first_launch_when_never_online() {
        let first = 5_000;
        assert!(!offline_grace_exceeded(first + 86_400, None, first, 2, false));
        assert!(offline_grace_exceeded(
            first + 2 * 86_400 + 1,
            None,
            first,
            2,
            false
        ));
    }

    #[test]
    fn clock_rollback_forces_lock() {
        assert!(offline_grace_exceeded(100, Some(50), 50, 2, true));
    }

    #[test]
    fn verifies_signed_access_fixture() {
        let policy = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../access.json"),
        )
        .expect("access.json");
        let sig = std::fs::read_to_string(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../access.json.sig"),
        )
        .expect("access.json.sig");
        assert!(verify_access_policy_bytes(&policy, &sig));
        let mut bad = policy.clone();
        if let Some(b) = bad.last_mut() {
            *b ^= 0x01;
        }
        assert!(!verify_access_policy_bytes(&bad, &sig));
    }
}
