CREATE INDEX IF NOT EXISTS idx_olivex_merge ON olivex_entries(session_id, nni, num_feuille, montant);
CREATE INDEX IF NOT EXISTS idx_cnam_merge ON cnam_entries(session_id, nni, code_fs, montant);
CREATE INDEX IF NOT EXISTS idx_results_session_cas ON comparison_results(session_id, cas);
