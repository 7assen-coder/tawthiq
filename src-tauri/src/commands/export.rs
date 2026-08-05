use crate::db::DbState;
use crate::guard;
use rust_xlsxwriter::{Format, Workbook};
use tauri::State;

#[tauri::command]
pub fn export_case_to_excel(
    db: State<'_, DbState>,
    session_id: i64,
    cas: String,
    output_path: String,
) -> Result<String, String> {
    guard::require_auth()?;
    guard::require_xlsx(&output_path)?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;

    let mut stmt = conn
        .prepare("SELECT cas, nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference, nature, resolution_status, resolution_note FROM comparison_results WHERE session_id = ?1 AND cas = ?2 ORDER BY difference DESC")
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, Option<String>, Option<String>, f64, f64, f64, Option<String>, Option<String>, Option<String>)> = stmt
        .query_map(rusqlite::params![session_id, cas], |row| {
            Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
                row.get(8)?, row.get(9)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    let header_fmt = Format::new().set_bold();

    let headers = if cas == "cas5" {
        vec!["NNI / INAM", "Fiche OLIVEX", "Fiche CNAM", "Mont. OLIVEX", "Mont. CNAM", "Différence (OLIVEX−CNAM)", "Statut", "Notes"]
    } else {
        vec!["NNI / INAM", "Fiche OLIVEX", "Fiche CNAM", "Mont. OLIVEX", "Mont. CNAM", "Différence (OLIVEX−CNAM)"]
    };

    for (col, header) in headers.iter().enumerate() {
        worksheet
            .write_string_with_format(0, col as u16, header.to_string(), &header_fmt)
            .map_err(|e| e.to_string())?;
    }

    for (row_idx, row_data) in rows.iter().enumerate() {
        let r = (row_idx + 1) as u32;
        worksheet.write_string(r, 0, &row_data.1).map_err(|e| e.to_string())?;
        worksheet.write_string(r, 1, row_data.2.as_deref().unwrap_or("—")).map_err(|e| e.to_string())?;
        worksheet.write_string(r, 2, row_data.3.as_deref().unwrap_or("—")).map_err(|e| e.to_string())?;
        worksheet.write_number(r, 3, row_data.4).map_err(|e| e.to_string())?;
        worksheet.write_number(r, 4, row_data.5).map_err(|e| e.to_string())?;
        worksheet.write_number(r, 5, row_data.6).map_err(|e| e.to_string())?;
        if cas == "cas5" {
            worksheet.write_string(r, 6, row_data.8.as_deref().unwrap_or("En attente")).map_err(|e| e.to_string())?;
            worksheet.write_string(r, 7, row_data.9.as_deref().unwrap_or("")).map_err(|e| e.to_string())?;
        }
    }

    workbook.save(&output_path).map_err(|e| e.to_string())?;
    Ok(output_path)
}

#[tauri::command]
pub fn export_full_report(
    db: State<'_, DbState>,
    session_id: i64,
    output_path: String,
) -> Result<String, String> {
    guard::require_auth()?;
    guard::require_xlsx(&output_path)?;
    let conn = db.0.lock().map_err(|_| "DB_ERROR".to_string())?;
    let mut workbook = Workbook::new();
    let header_fmt = Format::new().set_bold();

    let cas_names = ["cas1", "cas2", "cas3", "cas4", "cas5", "cas6", "cas7"];
    let sheet_names = [
        "Cas1_Conforme",
        "Cas2_Fiches_diff",
        "Cas3_Ecart_montant",
        "Cas4_Fiche_divergente",
        "Cas5_Manuel",
        "Cas6_Isole",
        "Cas7_INAM_diff_NPC",
    ];

    for (i, cas) in cas_names.iter().enumerate() {
        let worksheet = workbook.add_worksheet();
        worksheet.set_name(sheet_names[i]).map_err(|e| e.to_string())?;

        let headers = vec!["NNI / INAM", "Fiche OLIVEX", "Fiche CNAM", "Mont. OLIVEX", "Mont. CNAM", "Différence (OLIVEX−CNAM)"];
        for (col, header) in headers.iter().enumerate() {
            worksheet.write_string_with_format(0, col as u16, header.to_string(), &header_fmt).map_err(|e| e.to_string())?;
        }

        let mut stmt = conn
            .prepare("SELECT nni, fiche_olivex, fiche_cnam, montant_olivex, montant_cnam, difference FROM comparison_results WHERE session_id = ?1 AND cas = ?2 ORDER BY difference DESC")
            .map_err(|e| e.to_string())?;

        let rows: Vec<(String, Option<String>, Option<String>, f64, f64, f64)> = stmt
            .query_map(rusqlite::params![session_id, cas], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        for (row_idx, row_data) in rows.iter().enumerate() {
            let r = (row_idx + 1) as u32;
            worksheet.write_string(r, 0, &row_data.0).map_err(|e| e.to_string())?;
            worksheet.write_string(r, 1, row_data.1.as_deref().unwrap_or("—")).map_err(|e| e.to_string())?;
            worksheet.write_string(r, 2, row_data.2.as_deref().unwrap_or("—")).map_err(|e| e.to_string())?;
            worksheet.write_number(r, 3, row_data.3).map_err(|e| e.to_string())?;
            worksheet.write_number(r, 4, row_data.4).map_err(|e| e.to_string())?;
            worksheet.write_number(r, 5, row_data.5).map_err(|e| e.to_string())?;
        }
    }

    workbook.save(&output_path).map_err(|e| e.to_string())?;
    Ok(output_path)
}
