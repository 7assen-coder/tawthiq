# Privacy — Tawthiq

Tawthiq is an **offline-first** desktop application. It does not send billing data to a cloud service.

## What is stored locally

- PIN hash (bcrypt), never the PIN itself
- Imported and manually entered CNAM / OLIVEX rows (including NNI / INAM, fiche numbers, amounts)
- Comparison results and monthly summaries
- Optional UI draft (file paths and column maps only — NNI/amount drafts are not persisted)

Data lives in a SQLite file under the OS app-data directory for the current Windows / macOS / Linux user account.

## What is not collected

- No telemetry, crash analytics, or remote logging in v1
- Logs stay on disk under app data (Info level, rotating). Do not paste logs that may contain paths into public channels.

## Sharing between PCs

Use **backup / restore** or **Excel export**. A restore **replaces** the local database, including the PIN.

## Recommendations for IT

- Enable full-disk encryption (BitLocker / FileVault / LUKS) on every PC
- One OS login per shared ward PC if staff must see the same database
- Treat `tawthiq.db` as confidential patient-adjacent billing data
- PIN reset is operational only: restore a backup or delete the database (no in-app recovery)

SQLCipher at-rest encryption is planned if disk encryption cannot be mandated.
