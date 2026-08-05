mod commands;
mod db;
mod engine;
mod guard;

use db::DbState;
use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Info)
                    .max_file_size(2_000_000)
                    .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                    .build(),
            )?;

            let conn = db::init_db(app.handle()).expect("Failed to initialize database");
            app.manage(DbState(Mutex::new(conn)));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::auth::has_pin,
            commands::auth::setup_pin,
            commands::auth::verify_pin,
            commands::auth::change_pin,
            commands::auth::lock_session,
            commands::auth::get_app_version,
            commands::access::check_access,
            commands::access::get_install_id,
            commands::session::get_current_session,
            commands::session::check_and_archive_previous,
            commands::session::get_all_sessions,
            commands::session::archive_session,
            commands::import::preview_excel,
            commands::import::preview_excel_page,
            commands::import::import_excel,
            commands::import::import_excel_files,
            commands::entries::get_entry_counts,
            commands::entries::get_source_counts,
            commands::entries::get_olivex_entries,
            commands::entries::get_cnam_entries,
            commands::entries::add_olivex_entry,
            commands::entries::add_cnam_entry,
            commands::entries::update_olivex_entry,
            commands::entries::update_cnam_entry,
            commands::entries::delete_entry,
            commands::compare::run_comparison,
            commands::compare::get_comparison_results,
            commands::compare::get_latest_compare_result,
            commands::compare::update_resolution,
            commands::export::export_case_to_excel,
            commands::export::export_full_report,
            commands::backup::backup_database,
            commands::backup::restore_database,
            commands::backup::get_db_location,
            commands::backup::auto_backup,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
