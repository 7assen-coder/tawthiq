# Tawthiq — IT one-pager (FR / AR)

Offline desktop app for CNAM ↔ OLIVEX hospital billing reconciliation. **PIN only. No cloud. One local SQLite database per OS user account.**

---

## Français

### Installation

| OS | Installer | Notes |
| --- | --- | --- |
| Windows 10/11 | `Tawthiq_x.y.z_x64-setup.exe` (NSIS) | Per-user, **no admin**. Silent: `Tawthiq_…-setup.exe /S`. Installs/updates **WebView2** via bootstrapper if missing. |
| macOS 11+ | `.dmg` / `.app` | Gatekeeper: right-click → Open the first time, or deploy a notarized Developer ID build. |
| Linux | `.deb` or `.AppImage` | Verify SHA-256 from the release notes. Optional GPG later. |

**SmartScreen / Gatekeeper:** first unsigned or newly signed builds may be blocked. Prefer signed releases. Submit signed Windows binaries to Microsoft reputation if needed.

### One PC = one Windows profile = one database

Path examples:

- Windows: `%APPDATA%\com.tawthiq.desktop\tawthiq.db`
- macOS: `~/Library/Application Support/com.tawthiq.desktop/tawthiq.db`
- Linux: `~/.local/share/com.tawthiq.desktop/tawthiq.db`

A shared ward PC with **several Windows logins** will show **empty data** on each login. Use **one shared OS account**, or restore the same backup on each profile (they will then diverge independently).

The exact path is shown in **Réglages → Données**.

### Backup / restore (share between PCs)

1. Source PC: Réglages → **Sauvegarder** → `.db` file (consistent `VACUUM INTO`, includes WAL).
2. Copy the file (USB / shared folder).
3. Target PC: Réglages → **Restaurer** → confirm **replace all local data including PIN** → app relaunches.

Non-destructive alternative: **Rapport → Exporter tout** (Excel).

Auto-backup keeps the last 5 dumps under `…/backups/`.

### PIN reset (no in-app recovery)

- Restore a backup that still has a known PIN, **or**
- Quit Tawthiq, delete `tawthiq.db` (+ `-wal` / `-shm`), relaunch, create a new PIN.

Failed PIN: 5 tries → 30s / 2 min / 10 min lockout (enforced in the app process). Idle lock after 10 minutes. Top bar **Verrouiller**.

### Updates

Channel: public GitHub repo [7assen-coder/tawthiq](https://github.com/7assen-coder/tawthiq).

1. Publisher bumps version with `./scripts/release.sh 1.0.1` (tag `v1.0.1`).
2. GitHub Actions builds Windows / macOS / Linux and publishes a Release (including `latest.json` and `Tawthiq-v…-all-os.zip`).
3. Online PCs show **Update available → download → relaunch**. No silent force-update.

Offline USB install: use `Tawthiq-v…-all-os.zip` from the Release (also copied under `release/` after CI).

### Revoke access (kill switch)

File on `main`: [`access.json`](https://github.com/7assen-coder/tawthiq/blob/main/access.json).

- **All PCs:** `"revoked_all": true` then commit + push. No new app build.
- **One PC:** copy **Identifiant d’installation** from Réglages → À propos into `revoked_install_ids`, push.

When an online PC next opens Tawthiq it locks. PIN cannot bypass. Offline PCs that never reached GitHub keep working until they go online. After a PC has seen revoke, it stays locked even offline.

Un-revoke: set `revoked_all` false / remove the ID, push; the PC must go online once to clear the local flag.

### Security baseline

- Enable BitLocker / FileVault / disk encryption.
- Do not copy `tawthiq.db` to email or chat.
- Only one instance of the app may run (single-instance lock protects WAL).

---

## العربية

### التثبيت

| النظام | الملف | ملاحظات |
| --- | --- | --- |
| Windows | مثبت NSIS | لكل مستخدم، بدون صلاحيات مسؤول. تثبيت صامت: `/S`. يثبت WebView2 عند الحاجة. |
| macOS | DMG / App | Gatekeeper: فتح أول مرة بزر أيمن، أو نشر نسخة موثّقة. |
| Linux | deb / AppImage | تحقق من SHA-256. |

### جهاز واحد = حساب ويندوز واحد = قاعدة واحدة

كل حساب نظام تشغيل له قاعدة SQLite خاصة. أجهزة الجناح المشتركة يجب أن تستخدم **حساباً واحداً** وإلا ستظهر بيانات فارغة.

المسار يظهر في **الإعدادات → البيانات**.

أمثلة:

- Windows: `%APPDATA%\com.tawthiq.desktop\tawthiq.db`
- macOS: `~/Library/Application Support/com.tawthiq.desktop/tawthiq.db`
- Linux: `~/.local/share/com.tawthiq.desktop/tawthiq.db`

### النسخ الاحتياطي / الاستعادة

1. الجهاز المصدر: إعدادات → حفظ ملف `.db`
2. انسخ الملف (USB / مجلد مشترك)
3. الجهاز الهدف: إعدادات → استعادة → تأكيد **استبدال كل البيانات بما فيها PIN** → يعاد التشغيل

بديل غير مدمّر: تصدير Excel من التقرير.

### إعادة تعيين PIN

لا يوجد استرجاع داخل التطبيق. استعد نسخة احتياطية، أو احذف `tawthiq.db` وأنشئ رمزاً جديداً.

### التحديثات

المستودع العام: [7assen-coder/tawthiq](https://github.com/7assen-coder/tawthiq). بعد وسم إصدار جديد تظهر على الأجهزة المتصلة بالإنترنت رسالة تحديث → تنزيل → إعادة تشغيل.

### إلغاء الوصول

عدّل `access.json` على فرع `main`:

- الكل: `"revoked_all": true`
- جهاز واحد: أضف معرّف التثبيت من الإعدادات → حول

الجهاز المتصل بالإنترنت يُقفل. PIN لا يتجاوز القفل.

### الأمان

فعّل تشفير القرص. لا ترسل ملف القاعدة بالبريد. نسخة واحدة فقط من التطبيق تعمل في الوقت نفسه.
