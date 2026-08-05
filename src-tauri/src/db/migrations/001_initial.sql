CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pin_hash TEXT NOT NULL,
    display_name TEXT NOT NULL DEFAULT 'Agent',
    role TEXT NOT NULL DEFAULT 'operator',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active',
    created_by INTEGER REFERENCES users(id),
    archived_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS olivex_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    ref_code TEXT,
    organisme TEXT,
    date TEXT,
    nni TEXT NOT NULL,
    num_feuille TEXT,
    nature TEXT,
    montant REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cnam_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    num TEXT,
    code_fs TEXT,
    type_auth TEXT,
    nni TEXT NOT NULL,
    code TEXT,
    prestation TEXT,
    quantite INTEGER NOT NULL DEFAULT 1,
    montant REAL NOT NULL DEFAULT 0,
    user_bio TEXT,
    date_op TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comparison_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    cas TEXT NOT NULL,
    nni TEXT NOT NULL,
    fiche_olivex TEXT,
    fiche_cnam TEXT,
    montant_olivex REAL DEFAULT 0,
    montant_cnam REAL DEFAULT 0,
    difference REAL DEFAULT 0,
    nature TEXT,
    date_match INTEGER DEFAULT 0,
    resolved INTEGER DEFAULT 0,
    resolution_status TEXT DEFAULT 'en_attente',
    resolution_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS monthly_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    total_manque REAL NOT NULL DEFAULT 0,
    total_surplus REAL NOT NULL DEFAULT 0,
    total_conforme INTEGER NOT NULL DEFAULT 0,
    total_manuel INTEGER NOT NULL DEFAULT 0,
    cas1_count INTEGER DEFAULT 0,
    cas2_count INTEGER DEFAULT 0,
    cas3_count INTEGER DEFAULT 0,
    cas4_count INTEGER DEFAULT 0,
    cas5_count INTEGER DEFAULT 0,
    cas6_count INTEGER DEFAULT 0,
    cas7_count INTEGER DEFAULT 0,
    cas8_count INTEGER DEFAULT 0,
    conformity_rate REAL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_olivex_nni ON olivex_entries(nni);
CREATE INDEX IF NOT EXISTS idx_olivex_session ON olivex_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_olivex_feuille ON olivex_entries(num_feuille);
CREATE INDEX IF NOT EXISTS idx_cnam_nni ON cnam_entries(nni);
CREATE INDEX IF NOT EXISTS idx_cnam_session ON cnam_entries(session_id);
CREATE INDEX IF NOT EXISTS idx_cnam_code_fs ON cnam_entries(code_fs);
CREATE INDEX IF NOT EXISTS idx_results_session ON comparison_results(session_id);
CREATE INDEX IF NOT EXISTS idx_results_cas ON comparison_results(cas);
