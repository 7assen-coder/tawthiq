use serde::Serialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize)]
pub struct AggregatedEntry {
    pub nni: String,
    pub fiche: String,
    pub montant: f64,
    pub natures: Vec<String>,
    pub dates: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ComparisonResult {
    pub cas: String,
    pub nni: String,
    pub fiche_olivex: Option<String>,
    pub fiche_cnam: Option<String>,
    pub montant_olivex: f64,
    pub montant_cnam: f64,
    pub difference: f64,
    pub nature: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ComparisonSummary {
    pub total_manque: f64,
    pub total_surplus: f64,
    pub conformity_rate: f64,
    pub cas_counts: [i64; 7],
    pub results: Vec<ComparisonResult>,
}

const EPS: f64 = 0.01;

fn amounts_equal(a: f64, b: f64) -> bool {
    (a - b).abs() < EPS
}

pub fn run_comparison(
    olivex_rows: Vec<(String, String, f64, String, String)>,
    cnam_rows: Vec<(String, String, f64, String)>,
) -> ComparisonSummary {
    // Aggregate OLIVEX by (N° PC, N° feuille)
    let mut olivex_groups: HashMap<(String, String), AggregatedEntry> = HashMap::new();
    for (nni, fiche, montant, nature, date) in &olivex_rows {
        let key = (nni.clone(), fiche.clone());
        let entry = olivex_groups.entry(key).or_insert_with(|| AggregatedEntry {
            nni: nni.clone(),
            fiche: fiche.clone(),
            montant: 0.0,
            natures: Vec::new(),
            dates: Vec::new(),
        });
        entry.montant += montant;
        if !nature.is_empty() && !entry.natures.contains(nature) {
            entry.natures.push(nature.clone());
        }
        if !date.is_empty() && !entry.dates.contains(date) {
            entry.dates.push(date.clone());
        }
    }

    // Aggregate CNAM by (INAM, Code FS)
    let mut cnam_groups: HashMap<(String, String), AggregatedEntry> = HashMap::new();
    for (nni, code_fs, montant, date_op) in &cnam_rows {
        let key = (nni.clone(), code_fs.clone());
        let entry = cnam_groups.entry(key).or_insert_with(|| AggregatedEntry {
            nni: nni.clone(),
            fiche: code_fs.clone(),
            montant: 0.0,
            natures: Vec::new(),
            dates: Vec::new(),
        });
        entry.montant += montant;
        if !date_op.is_empty() && !entry.dates.contains(date_op) {
            entry.dates.push(date_op.clone());
        }
    }

    let olivex_keys: HashSet<(String, String)> = olivex_groups.keys().cloned().collect();
    let cnam_keys: HashSet<(String, String)> = cnam_groups.keys().cloned().collect();

    let mut olivex_nni_fiches: HashMap<String, Vec<String>> = HashMap::new();
    for (nni, fiche) in &olivex_keys {
        olivex_nni_fiches
            .entry(nni.clone())
            .or_default()
            .push(fiche.clone());
    }
    let mut cnam_nni_fiches: HashMap<String, Vec<String>> = HashMap::new();
    for (nni, fiche) in &cnam_keys {
        cnam_nni_fiches
            .entry(nni.clone())
            .or_default()
            .push(fiche.clone());
    }

    let olivex_ids: HashSet<String> = olivex_nni_fiches.keys().cloned().collect();
    let cnam_ids: HashSet<String> = cnam_nni_fiches.keys().cloned().collect();

    let mut results: Vec<ComparisonResult> = Vec::new();
    let mut processed_olivex: HashSet<(String, String)> = HashSet::new();
    let mut processed_cnam: HashSet<(String, String)> = HashSet::new();

    // --- Pass 1: Same ID + same fiche → Cas1 (equal) or Cas3 (diff montant) ---
    for key in olivex_keys.intersection(&cnam_keys) {
        let o_entry = &olivex_groups[key];
        let c_entry = &cnam_groups[key];
        let diff = o_entry.montant - c_entry.montant;
        let cas = if amounts_equal(o_entry.montant, c_entry.montant) {
            "cas1"
        } else {
            "cas3"
        };

        results.push(ComparisonResult {
            cas: cas.to_string(),
            nni: key.0.clone(),
            fiche_olivex: Some(key.1.clone()),
            fiche_cnam: Some(key.1.clone()),
            montant_olivex: o_entry.montant,
            montant_cnam: c_entry.montant,
            difference: if cas == "cas1" { 0.0 } else { diff },
            nature: o_entry.natures.first().cloned(),
        });
        processed_olivex.insert(key.clone());
        processed_cnam.insert(key.clone());
    }

    // --- Pass 2: Cas7 — same fiche + same montant, different IDs (INAM ≠ N° PC) ---
    let mut olivex_by_fiche: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for key in &olivex_keys {
        if processed_olivex.contains(key) {
            continue;
        }
        let entry = &olivex_groups[key];
        olivex_by_fiche
            .entry(key.1.clone())
            .or_default()
            .push((key.0.clone(), entry.montant));
    }
    let mut cnam_by_fiche: HashMap<String, Vec<(String, f64)>> = HashMap::new();
    for key in &cnam_keys {
        if processed_cnam.contains(key) {
            continue;
        }
        let entry = &cnam_groups[key];
        cnam_by_fiche
            .entry(key.1.clone())
            .or_default()
            .push((key.0.clone(), entry.montant));
    }

    let common_fiches: HashSet<String> = olivex_by_fiche
        .keys()
        .filter(|f| cnam_by_fiche.contains_key(*f))
        .cloned()
        .collect();

    for fiche in &common_fiches {
        let o_list = olivex_by_fiche.get_mut(fiche).unwrap();
        let c_list = cnam_by_fiche.get_mut(fiche).unwrap();
        let mut used_o: HashSet<usize> = HashSet::new();
        let mut used_c: HashSet<usize> = HashSet::new();

        for (oi, (o_id, o_mont)) in o_list.iter().enumerate() {
            if used_o.contains(&oi) {
                continue;
            }
            let o_key = (o_id.clone(), fiche.clone());
            if processed_olivex.contains(&o_key) {
                continue;
            }

            for (ci, (c_id, c_mont)) in c_list.iter().enumerate() {
                if used_c.contains(&ci) {
                    continue;
                }
                if o_id == c_id {
                    continue; // same ID handled in pass 1
                }
                let c_key = (c_id.clone(), fiche.clone());
                if processed_cnam.contains(&c_key) {
                    continue;
                }
                if !amounts_equal(*o_mont, *c_mont) {
                    continue;
                }

                let o_entry = &olivex_groups[&o_key];
                results.push(ComparisonResult {
                    cas: "cas7".to_string(),
                    nni: format!("{} ≠ {}", o_id, c_id),
                    fiche_olivex: Some(fiche.clone()),
                    fiche_cnam: Some(fiche.clone()),
                    montant_olivex: *o_mont,
                    montant_cnam: *c_mont,
                    difference: 0.0,
                    nature: o_entry.natures.first().cloned(),
                });
                used_o.insert(oi);
                used_c.insert(ci);
                processed_olivex.insert(o_key);
                processed_cnam.insert(c_key);
                break;
            }
        }
    }

    // --- Pass 3–5: Per-ID remaining matches (Cas2, Cas4, Cas5) for IDs in both ---
    let shared_ids: HashSet<String> = olivex_ids.intersection(&cnam_ids).cloned().collect();

    for nni in &shared_ids {
        let remaining_o: Vec<String> = olivex_nni_fiches
            .get(nni)
            .map(|fiches| {
                fiches
                    .iter()
                    .filter(|f| !processed_olivex.contains(&(nni.clone(), (*f).clone())))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let remaining_c: Vec<String> = cnam_nni_fiches
            .get(nni)
            .map(|fiches| {
                fiches
                    .iter()
                    .filter(|f| !processed_cnam.contains(&(nni.clone(), (*f).clone())))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();

        if remaining_o.is_empty() && remaining_c.is_empty() {
            continue;
        }

        // Cas2: same ID + same montant, different fiches
        let mut matched_o: HashSet<usize> = HashSet::new();
        let mut matched_c: HashSet<usize> = HashSet::new();

        for (oi, of) in remaining_o.iter().enumerate() {
            if matched_o.contains(&oi) {
                continue;
            }
            let o_key = (nni.clone(), of.clone());
            let o_entry = &olivex_groups[&o_key];

            for (ci, cf) in remaining_c.iter().enumerate() {
                if matched_c.contains(&ci) {
                    continue;
                }
                let c_key = (nni.clone(), cf.clone());
                let c_entry = &cnam_groups[&c_key];

                if amounts_equal(o_entry.montant, c_entry.montant) {
                    results.push(ComparisonResult {
                        cas: "cas2".to_string(),
                        nni: nni.clone(),
                        fiche_olivex: Some(of.clone()),
                        fiche_cnam: Some(cf.clone()),
                        montant_olivex: o_entry.montant,
                        montant_cnam: c_entry.montant,
                        difference: 0.0,
                        nature: o_entry.natures.first().cloned(),
                    });
                    matched_o.insert(oi);
                    matched_c.insert(ci);
                    processed_olivex.insert(o_key);
                    processed_cnam.insert(c_key);
                    break;
                }
            }
        }

        let still_o: Vec<String> = remaining_o
            .iter()
            .enumerate()
            .filter(|(i, _)| !matched_o.contains(i))
            .map(|(_, f)| f.clone())
            .collect();
        let still_c: Vec<String> = remaining_c
            .iter()
            .enumerate()
            .filter(|(i, _)| !matched_c.contains(i))
            .map(|(_, f)| f.clone())
            .collect();

        if still_o.is_empty() && still_c.is_empty() {
            continue;
        }

        // Cas4: exactly one group each side, different fiches, different montants
        if still_o.len() == 1 && still_c.len() == 1 {
            let of = &still_o[0];
            let cf = &still_c[0];
            let o_key = (nni.clone(), of.clone());
            let c_key = (nni.clone(), cf.clone());
            let o_entry = &olivex_groups[&o_key];
            let c_entry = &cnam_groups[&c_key];
            let diff = o_entry.montant - c_entry.montant;

            results.push(ComparisonResult {
                cas: "cas4".to_string(),
                nni: nni.clone(),
                fiche_olivex: Some(of.clone()),
                fiche_cnam: Some(cf.clone()),
                montant_olivex: o_entry.montant,
                montant_cnam: c_entry.montant,
                difference: diff,
                nature: o_entry.natures.first().cloned(),
            });
            processed_olivex.insert(o_key);
            processed_cnam.insert(c_key);
            continue;
        }

        // Cas5: multiple unmatched fiches with different montants → manual verification
        if !still_o.is_empty() || !still_c.is_empty() {
            for of in &still_o {
                let o_key = (nni.clone(), of.clone());
                if processed_olivex.contains(&o_key) {
                    continue;
                }
                let o_entry = &olivex_groups[&o_key];
                results.push(ComparisonResult {
                    cas: "cas5".to_string(),
                    nni: nni.clone(),
                    fiche_olivex: Some(of.clone()),
                    fiche_cnam: None,
                    montant_olivex: o_entry.montant,
                    montant_cnam: 0.0,
                    difference: o_entry.montant,
                    nature: o_entry.natures.first().cloned(),
                });
                processed_olivex.insert(o_key);
            }
            for cf in &still_c {
                let c_key = (nni.clone(), cf.clone());
                if processed_cnam.contains(&c_key) {
                    continue;
                }
                let c_entry = &cnam_groups[&c_key];
                results.push(ComparisonResult {
                    cas: "cas5".to_string(),
                    nni: nni.clone(),
                    fiche_olivex: None,
                    fiche_cnam: Some(cf.clone()),
                    montant_olivex: 0.0,
                    montant_cnam: c_entry.montant,
                    difference: c_entry.montant,
                    nature: None,
                });
                processed_cnam.insert(c_key);
            }
        }
    }

    // --- Pass 6: Cas6 — ID only in one source (isolated) ---
    for key in &olivex_keys {
        if processed_olivex.contains(key) {
            continue;
        }
        let nni = &key.0;
        // If ID exists on CNAM but leftovers remain, they should already be Cas5.
        // True orphans: ID never on the other side, OR still unprocessed after all passes.
        let entry = &olivex_groups[key];
        let cas = if cnam_ids.contains(nni) {
            // Leftover with partner ID present — treat as manual (Cas5)
            "cas5"
        } else {
            "cas6"
        };
        results.push(ComparisonResult {
            cas: cas.to_string(),
            nni: nni.clone(),
            fiche_olivex: Some(key.1.clone()),
            fiche_cnam: None,
            montant_olivex: entry.montant,
            montant_cnam: 0.0,
            difference: entry.montant,
            nature: entry.natures.first().cloned(),
        });
        processed_olivex.insert(key.clone());
    }

    for key in &cnam_keys {
        if processed_cnam.contains(key) {
            continue;
        }
        let nni = &key.0;
        let entry = &cnam_groups[key];
        let cas = if olivex_ids.contains(nni) {
            "cas5"
        } else {
            "cas6"
        };
        results.push(ComparisonResult {
            cas: cas.to_string(),
            nni: nni.clone(),
            fiche_olivex: None,
            fiche_cnam: Some(key.1.clone()),
            montant_olivex: 0.0,
            montant_cnam: entry.montant,
            difference: entry.montant,
            nature: None,
        });
        processed_cnam.insert(key.clone());
    }

    // Compute totals
    let mut cas_counts = [0i64; 7];
    let mut total_manque = 0.0;
    let mut total_surplus = 0.0;

    for r in &results {
        match r.cas.as_str() {
            "cas1" => cas_counts[0] += 1,
            "cas2" => cas_counts[1] += 1,
            "cas3" => {
                cas_counts[2] += 1;
                if r.difference < 0.0 {
                    total_manque += r.difference.abs();
                } else if r.difference > 0.0 {
                    total_surplus += r.difference.abs();
                }
            }
            "cas4" => {
                cas_counts[3] += 1;
                if r.difference < 0.0 {
                    total_manque += r.difference.abs();
                } else if r.difference > 0.0 {
                    total_surplus += r.difference.abs();
                }
            }
            "cas5" => cas_counts[4] += 1,
            "cas6" => cas_counts[5] += 1,
            "cas7" => cas_counts[6] += 1,
            _ => {}
        }
    }

    let total_groups = results.len() as f64;
    let conforme_count = (cas_counts[0] + cas_counts[1] + cas_counts[6]) as f64;
    let conformity_rate = if total_groups > 0.0 {
        (conforme_count / total_groups) * 100.0
    } else {
        0.0
    };

    ComparisonSummary {
        total_manque,
        total_surplus,
        conformity_rate,
        cas_counts,
        results,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o(nni: &str, fiche: &str, montant: f64) -> (String, String, f64, String, String) {
        (nni.into(), fiche.into(), montant, String::new(), String::new())
    }
    fn c(nni: &str, fiche: &str, montant: f64) -> (String, String, f64, String) {
        (nni.into(), fiche.into(), montant, String::new())
    }

    #[test]
    fn cas1_same_id_fiche_amount() {
        let s = run_comparison(vec![o("111", "F1", 100.0)], vec![c("111", "F1", 100.0)]);
        assert_eq!(s.cas_counts[0], 1);
        assert_eq!(s.results[0].cas, "cas1");
        assert_eq!(s.total_manque, 0.0);
    }

    #[test]
    fn cas3_amount_gap() {
        let s = run_comparison(vec![o("111", "F1", 80.0)], vec![c("111", "F1", 100.0)]);
        assert_eq!(s.cas_counts[2], 1);
        assert!((s.total_manque - 20.0).abs() < 0.001);
    }

    #[test]
    fn cas2_same_amount_different_fiche() {
        let s = run_comparison(vec![o("111", "A", 50.0)], vec![c("111", "B", 50.0)]);
        assert_eq!(s.cas_counts[1], 1);
        assert_eq!(s.results[0].cas, "cas2");
    }

    #[test]
    fn cas6_isolated() {
        let s = run_comparison(vec![o("111", "A", 10.0)], vec![c("222", "B", 20.0)]);
        assert_eq!(s.cas_counts[5], 2);
    }

    #[test]
    fn cas7_same_fiche_amount_different_id() {
        let s = run_comparison(vec![o("111", "F9", 40.0)], vec![c("222", "F9", 40.0)]);
        assert_eq!(s.cas_counts[6], 1);
        assert_eq!(s.results[0].cas, "cas7");
    }

    #[test]
    fn cas4_same_id_different_fiche_and_amount() {
        let s = run_comparison(vec![o("111", "A", 80.0)], vec![c("111", "B", 100.0)]);
        assert_eq!(s.cas_counts[3], 1);
        assert_eq!(s.results[0].cas, "cas4");
        assert!((s.total_manque - 20.0).abs() < 0.001);
    }

    #[test]
    fn cas5_multiple_unmatched_fiches_same_id() {
        let s = run_comparison(
            vec![o("111", "A", 10.0), o("111", "B", 20.0)],
            vec![c("111", "C", 30.0)],
        );
        assert!(s.cas_counts[4] >= 2);
        assert!(s.results.iter().all(|r| r.cas == "cas5"));
    }
}
