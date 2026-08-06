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

### PIN reset

1. **Code de récupération** (affiché une fois à la création du PIN) → écran PIN → **PIN oublié** → saisir le code → créer un nouveau PIN.
2. **Code temporaire** (éditeur) : l’utilisatrice envoie son **Identifiant d’installation** (WhatsApp **+222 41824343** / e-mail **MoHasseenn@gmail.com**). L’éditeur génère un code 24 h depuis l’onglet **Admin**, pousse `access.json`, elle saisit le code puis crée un nouveau PIN.
3. Dernier recours : restaurer une sauvegarde, ou supprimer `tawthiq.db` (+ `-wal` / `-shm`) (perte des données locales).

Failed PIN: 5 tries → 30s / 2 min / 10 min lockout. Idle lock after 10 minutes. Top bar **Verrouiller**.

### Offline grace (hidden)

PCs may work offline for **2 full days** after the last successful online policy check. On the **3rd day** the app blocks until Internet is available (screen shows Install ID + contact; no countdown). Admin machines listed in `admin_install_ids` are exempt.

### Auto-listing (machines)

Any PC that opens Tawthiq **online once** heartbeats to the install registry. Admin → **Machines** shows full Install ID, hostname, app version, and last seen. No need to paste IDs by hand for discovery. Revoke / admin roles / temp reset codes still require editing + signing + pushing `access.json`.

### Updates

Channel: public GitHub repo [7assen-coder/tawthiq](https://github.com/7assen-coder/tawthiq).

1. Publisher bumps version with `./scripts/release.sh 1.2.0` (tag `v1.2.0`).
2. GitHub Actions builds Windows / macOS / Linux and publishes a Release (including `latest.json` and `Tawthiq-v…-all-os.zip`).
3. Online PCs show **Update available → download → relaunch**. No silent force-update.

Offline USB install: use `Tawthiq-v…-all-os.zip` from the Release (also copied under `release/` after CI).

### Revoke access (kill switch)

File on `main`: [`access.json`](https://github.com/7assen-coder/tawthiq/blob/main/access.json) + [`access.json.sig`](https://github.com/7assen-coder/tawthiq/blob/main/access.json.sig).

Apps **reject** unsigned or tampered policy and keep the last good cache. Always sign before push:

```bash
./scripts/sign-access.sh
# or after Admin export:
./scripts/admin-push-access.sh /path/to/access.json
```

Private signing key: `~/.config/tawthiq/access-signing.key` (never commit).

- **All PCs:** `"revoked_all": true`, re-sign, commit + push. No new app build.
- **One PC:** copy Install ID into `revoked_install_ids`, or use Admin → export → `./scripts/admin-push-access.sh`.

Blocked screens always show Install ID + WhatsApp / e-mail. PIN cannot bypass revoke.

Un-revoke: remove the ID / set `revoked_all` false, re-sign, push; the PC must go online once.

### Admin tab (publisher only)

1. Add your Install ID to `admin_install_ids` in `access.json`, sign, and push.
2. Reopen Tawthiq online → fifth tab **Admin** appears.
3. Set / enter Admin Master PIN (separate from operator PIN).
4. Machines auto-fill from online heartbeats. Issue temp resets, edit revoke lists / grace days / contact, **Export access.json**, then `./scripts/admin-push-access.sh path`.

### Repo hardening (keep public)

- Repo stays **public** so the Tauri updater (`releases/latest/download/latest.json`) keeps working without embedding GitHub tokens.
- Policy is **Ed25519-signed**; forks or unsigned edits do not affect clients.
- Branch protection on `main` + [CODEOWNERS](../.github/CODEOWNERS) for `access.json` / workflows.
- Install discovery is **not** written via GitHub (Cloudflare Worker + KV).

### Security baseline

- Enable BitLocker / FileVault / disk encryption.
- Do not copy `tawthiq.db` to email or chat.
- Only one instance of the app may run (single-instance lock protects WAL).
- Never ship updater private keys, access signing private keys, or GitHub tokens inside the hospital build.

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

1. **رمز الاستعادة** (يظهر مرة عند إنشاء PIN) → نسيت الرمز → أدخل الرمز → أنشئ PIN جديداً.
2. **رمز مؤقت من الناشر**: أرسلي معرّف التثبيت عبر واتساب **+222 41824343** أو البريد **MoHasseenn@gmail.com**. الناشر يصدر رمزاً لـ 24 ساعة من تبويب الإدارة.
3. آخر حل: استعادة نسخة، أو حذف `tawthiq.db` (فقدان البيانات المحلية).

### العمل دون إنترنت

مسموح يومان كاملان بعد آخر تحقق ناجح عبر الإنترنت. من اليوم الثالث يُقفل التطبيق حتى يتصل بالإنترنت (شاشة تعرض المعرّف ووسائل التواصل دون عدّاد ظاهر). أجهزة الأدمن مستثناة.

### الظهور التلقائي للأجهزة

أي جهاز يفتح توثيق **متصلاً مرة واحدة** يظهر في تبويب الإدارة (المعرّف الكامل، المضيف، الإصدار، آخر اتصال). الإلغاء وأدوار الأدمن والرموز المؤقتة ما زالت عبر توقيع ودفع `access.json`.

### التحديثات

المستودع العام: [7assen-coder/tawthiq](https://github.com/7assen-coder/tawthiq). بعد وسم إصدار جديد تظهر على الأجهزة المتصلة بالإنترنت رسالة تحديث → تنزيل → إعادة تشغيل.

### إلغاء الوصول

عدّل `access.json` ثم وقّع (`./scripts/sign-access.sh`) وادفع على `main`. التطبيق يرفض السياسة غير الموقّعة.

- الكل: `"revoked_all": true`
- جهاز واحد: أضف معرّف التثبيت من شاشة الإلغاء / الإعدادات

الشاشات تعرض دائماً معرّف التثبيت + واتساب / بريد. PIN لا يتجاوز القفل.

### تبويب الإدارة (للناشر فقط)

أضف معرّف جهازك إلى `admin_install_ids`، وقّع وادفع، افتح التطبيق متصلاً، أنشئ رمز أدمن. الأجهزة المتصلة تظهر تلقائياً. صدّر `access.json` ثم `./scripts/admin-push-access.sh`.

### الأمان

فعّل تشفير القرص. لا ترسل ملف القاعدة بالبريد. نسخة واحدة فقط من التطبيق تعمل في الوقت نفسه. لا تُضمّن مفاتيح التوقيع الخاصة في البناء.
