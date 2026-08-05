use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

const ACCESS_URL: &str = "https://raw.githubusercontent.com/7assen-coder/tawthiq/main/access.json";

#[derive(Debug, Deserialize)]
struct RemoteAccess {
    #[serde(default)]
    revoked_all: bool,
    #[serde(default)]
    revoked_install_ids: Vec<String>,
    #[serde(default)]
    message_fr: Option<String>,
    #[serde(default)]
    message_ar: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct AccessStatus {
    pub install_id: String,
    pub revoked: bool,
    pub message_fr: String,
    pub message_ar: String,
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

fn read_or_create_install_id(app: &AppHandle) -> Result<String, String> {
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

fn default_messages() -> (String, String) {
    (
        "Accès révoqué. Contactez l’éditeur.".into(),
        "تم إلغاء الوصول. تواصل مع الناشر.".into(),
    )
}

fn fetch_remote() -> Option<RemoteAccess> {
    let agent = ureq::AgentBuilder::new()
        .timeout(std::time::Duration::from_secs(5))
        .build();
    let resp = agent.get(ACCESS_URL).call().ok()?;
    let text = resp.into_string().ok()?;
    serde_json::from_str(&text).ok()
}

#[tauri::command]
pub fn check_access(app: AppHandle) -> Result<AccessStatus, String> {
    let install_id = read_or_create_install_id(&app)?;
    let (default_fr, default_ar) = default_messages();

    if let Some(remote) = fetch_remote() {
        let revoked = remote.revoked_all
            || remote
                .revoked_install_ids
                .iter()
                .any(|id| id.trim() == install_id);
        set_local_revoked(&app, revoked);
        if revoked {
            crate::guard::lock();
        }
        return Ok(AccessStatus {
            install_id,
            revoked,
            message_fr: remote.message_fr.unwrap_or(default_fr),
            message_ar: remote.message_ar.unwrap_or(default_ar),
        });
    }

    let revoked = local_revoked(&app);
    if revoked {
        crate::guard::lock();
    }
    Ok(AccessStatus {
        install_id,
        revoked,
        message_fr: default_fr,
        message_ar: default_ar,
    })
}

#[tauri::command]
pub fn get_install_id(app: AppHandle) -> Result<String, String> {
    crate::guard::require_auth()?;
    read_or_create_install_id(&app)
}
